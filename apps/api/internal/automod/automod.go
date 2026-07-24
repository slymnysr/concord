// Concord AutoMod — mesaj öncesi içerik kontrol katmanı.
// Türkiye pazarı için kritik: BTK düzenlemeleri (5651 + içerik kaldırma).
package automod

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5/pgxpool"
)

type TriggerType string

const (
	TriggerKeyword         TriggerType = "keyword"
	TriggerRegex           TriggerType = "regex"
	TriggerMentionSpam     TriggerType = "mention_spam"
	TriggerMessageSpam     TriggerType = "message_spam"
	TriggerLinkBlacklist   TriggerType = "link_blacklist"
	TriggerCaps            TriggerType = "caps"
	TriggerInviteBlacklist TriggerType = "invite_blacklist"
)

type ActionType string

const (
	ActionBlock   ActionType = "block"
	ActionTimeout ActionType = "timeout"
	ActionAlert   ActionType = "alert"
	ActionDelete  ActionType = "delete"
)

type Rule struct {
	ID               int64           `json:"id,string"`
	GuildID          int64           `json:"guild_id,string"`
	Name             string          `json:"name"`
	Enabled          bool            `json:"enabled"`
	TriggerType      TriggerType     `json:"trigger_type"`
	TriggerData      json.RawMessage `json:"trigger_data"`
	Actions          json.RawMessage `json:"actions"`
	ExemptRoleIDs    []int64         `json:"exempt_role_ids"`
	ExemptChannelIDs []int64         `json:"exempt_channel_ids"`
}

// Action — uygulanacak aksiyon
type Action struct {
	Type           ActionType `json:"type"`
	DurationSec    int64      `json:"duration_sec,omitempty"`     // timeout için
	AlertChannelID int64      `json:"alert_channel_id,omitempty"` // alert için
	CustomMessage  string     `json:"custom_message,omitempty"`   // kullanıcıya geri dönüş
}

// Decision — engine'in mesaj için verdiği karar
type Decision struct {
	Triggered   bool
	RuleID      int64
	RuleName    string
	MatchedText string
	Actions     []Action
}

type Engine struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Engine {
	return &Engine{pool: pool}
}

// Inspect — mesajı kurallara karşı denetle.
// guildID nil ise (DM) automod skip eder.
func (e *Engine) Inspect(ctx context.Context, guildID int64, channelID int64, userID int64, userMemberRoles []int64, content string) *Decision {
	rows, err := e.pool.Query(ctx, `
        SELECT id, name, trigger_type::text, trigger_data, actions, exempt_role_ids, exempt_channel_ids
        FROM automod_rules
        WHERE guild_id = $1 AND enabled = TRUE
    `, guildID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	for rows.Next() {
		var r Rule
		var triggerType string
		if err := rows.Scan(&r.ID, &r.Name, &triggerType, &r.TriggerData, &r.Actions, &r.ExemptRoleIDs, &r.ExemptChannelIDs); err != nil {
			continue
		}
		r.TriggerType = TriggerType(triggerType)
		r.GuildID = guildID

		// Muafiyet kontrolü
		if intersect(userMemberRoles, r.ExemptRoleIDs) {
			continue
		}
		if containsInt64(r.ExemptChannelIDs, channelID) {
			continue
		}

		// message_spam state gerektirir (son mesajlar) → ayrı kontrol
		var match string
		if r.TriggerType == TriggerMessageSpam {
			match = e.checkMessageSpam(ctx, channelID, userID, content, r.TriggerData)
		} else {
			match = check(r.TriggerType, r.TriggerData, content)
		}
		if match == "" {
			continue
		}

		var actions []Action
		_ = json.Unmarshal(r.Actions, &actions)
		return &Decision{
			Triggered:   true,
			RuleID:      r.ID,
			RuleName:    r.Name,
			MatchedText: match,
			Actions:     actions,
		}
	}
	return nil
}

// checkMessageSpam — kullanıcının son mesajlarına bakar: kısa sürede çok mesaj veya tekrarlı içerik.
// Config: { max_messages, interval_sec, max_duplicates }. Varsayılan: 5 mesaj / 7 sn, 3 tekrar.
func (e *Engine) checkMessageSpam(ctx context.Context, channelID, userID int64, content string, data json.RawMessage) string {
	var d struct {
		MaxMessages   int `json:"max_messages"`
		IntervalSec   int `json:"interval_sec"`
		MaxDuplicates int `json:"max_duplicates"`
	}
	_ = json.Unmarshal(data, &d)
	if d.MaxMessages == 0 {
		d.MaxMessages = 5
	}
	if d.IntervalSec == 0 {
		d.IntervalSec = 7
	}
	if d.MaxDuplicates == 0 {
		d.MaxDuplicates = 3
	}
	// Son interval içinde bu kullanıcının kaç mesajı var (bu mesaj henüz eklenmedi → +1)
	var recentCount int
	_ = e.pool.QueryRow(ctx, `
		SELECT count(*) FROM messages
		WHERE channel_id = $1 AND author_id = $2 AND created_at > now() - make_interval(secs => $3)
	`, channelID, userID, d.IntervalSec).Scan(&recentCount)
	if recentCount+1 > d.MaxMessages {
		return "message-spam-rate"
	}
	// Aynı içeriğin tekrarı (son 60 sn)
	var dupCount int
	_ = e.pool.QueryRow(ctx, `
		SELECT count(*) FROM messages
		WHERE channel_id = $1 AND author_id = $2 AND content = $3 AND created_at > now() - interval '60 seconds'
	`, channelID, userID, content).Scan(&dupCount)
	if dupCount+1 > d.MaxDuplicates {
		return "message-spam-duplicate"
	}
	return ""
}

func check(tt TriggerType, data json.RawMessage, content string) string {
	lower := strings.ToLower(content)
	switch tt {
	case TriggerKeyword:
		var d struct {
			Keywords []string `json:"keywords"`
		}
		if err := json.Unmarshal(data, &d); err != nil {
			return ""
		}
		for _, kw := range d.Keywords {
			kw = strings.ToLower(strings.TrimSpace(kw))
			if kw != "" && strings.Contains(lower, kw) {
				return kw
			}
		}
	case TriggerRegex:
		var d struct {
			Patterns []string `json:"patterns"`
		}
		if err := json.Unmarshal(data, &d); err != nil {
			return ""
		}
		for _, p := range d.Patterns {
			re, err := regexp.Compile("(?i)" + p)
			if err != nil {
				continue
			}
			if m := re.FindString(content); m != "" {
				return m
			}
		}
	case TriggerLinkBlacklist:
		var d struct {
			Domains []string `json:"domains"`
		}
		if err := json.Unmarshal(data, &d); err != nil {
			return ""
		}
		for _, dom := range d.Domains {
			dom = strings.ToLower(strings.TrimSpace(dom))
			if dom == "" {
				continue
			}
			if strings.Contains(lower, "://"+dom) || strings.Contains(lower, "://www."+dom) {
				return dom
			}
		}
	case TriggerInviteBlacklist:
		// İçinde concord davet kodu (8 char) veya başka chat platformu daveti varsa
		if matchInvitePattern(content) {
			return "invite-link"
		}
	case TriggerCaps:
		var d struct {
			Threshold float64 `json:"threshold"` // 0.0-1.0
			MinLength int     `json:"min_length"`
		}
		_ = json.Unmarshal(data, &d)
		if d.MinLength == 0 {
			d.MinLength = 10
		}
		if d.Threshold == 0 {
			d.Threshold = 0.7
		}
		if len(content) < d.MinLength {
			return ""
		}
		var upper, total int
		for _, r := range content {
			if !unicode.IsLetter(r) {
				continue
			}
			total++
			if unicode.IsUpper(r) {
				upper++
			}
		}
		if total > 0 && float64(upper)/float64(total) >= d.Threshold {
			return "caps"
		}
	case TriggerMentionSpam:
		var d struct {
			MaxMentions int `json:"max_mentions"`
		}
		_ = json.Unmarshal(data, &d)
		if d.MaxMentions == 0 {
			d.MaxMentions = 5
		}
		re := regexp.MustCompile(`(?:@\w+|<@!?\d+>|<@&\d+>|@everyone|@here)`)
		matches := re.FindAllString(content, -1)
		if len(matches) > d.MaxMentions {
			return "too-many-mentions"
		}
	}
	return ""
}

var inviteRegex = regexp.MustCompile(`(?:concord\.com/invite/|discord\.gg/|discord\.com/invite/|t\.me/|telegram\.me/)`)

func matchInvitePattern(content string) bool {
	return inviteRegex.MatchString(strings.ToLower(content))
}

func intersect(a, b []int64) bool {
	if len(a) == 0 || len(b) == 0 {
		return false
	}
	m := make(map[int64]bool, len(a))
	for _, v := range a {
		m[v] = true
	}
	for _, v := range b {
		if m[v] {
			return true
		}
	}
	return false
}

func containsInt64(s []int64, v int64) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

// LogAction — uygulanan aksiyonu DB'ye kaydet (analitik/audit)
func (e *Engine) LogAction(ctx context.Context, id, ruleID, guildID, userID, channelID int64, content, matchedText string, actionType ActionType) {
	_, _ = e.pool.Exec(ctx, `
        INSERT INTO automod_actions (id, rule_id, guild_id, user_id, channel_id, message_content, matched_text, action_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::automod_action_type)
    `, id, ruleID, guildID, userID, channelID, content, matchedText, string(actionType))
}

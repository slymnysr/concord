// Concord realtime event publisher — Redis PubSub üzerinden Gateway'e gönderir.
package events

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

type Publisher struct {
	rdb *redis.Client
}

func New(rdb *redis.Client) *Publisher {
	return &Publisher{rdb: rdb}
}

// ToGuild — guild:<id> topic'ine yayar (tüm sunucu üyeleri alır)
func (p *Publisher) ToGuild(ctx context.Context, guildID int64, eventType string, payload map[string]any) {
	if p == nil || p.rdb == nil {
		return
	}
	if payload == nil {
		payload = map[string]any{}
	}
	payload["type"] = eventType
	payload["guild_id"] = strconv.FormatInt(guildID, 10)
	payload["ts"] = time.Now().UnixMilli()
	body, _ := json.Marshal(payload)
	_, _ = p.rdb.Publish(ctx, "concord:guild:"+strconv.FormatInt(guildID, 10), body).Result()
}

// ToUser — user:<id> topic'ine yayar (sadece tek kullanıcı alır)
func (p *Publisher) ToUser(ctx context.Context, userID int64, eventType string, payload map[string]any) {
	if p == nil || p.rdb == nil {
		return
	}
	if payload == nil {
		payload = map[string]any{}
	}
	payload["type"] = eventType
	payload["ts"] = time.Now().UnixMilli()
	body, _ := json.Marshal(payload)
	_, _ = p.rdb.Publish(ctx, "concord:user:"+strconv.FormatInt(userID, 10), body).Result()
}

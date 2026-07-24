// Anket kartı — mesaj içinde anketi gösterir, oy ver/geri çek, oluşturan kapatır.
import { t } from './i18n';
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from './theme';
import { api, type Poll } from './api';

export function PollCard({ messageId, meId }: { messageId: string; meId: string }) {
  const [poll, setPoll] = useState<Poll | null>(null);

  const reload = () =>
    api.polls
      .forMessage(messageId)
      .then(setPoll)
      .catch(() => {});
  useEffect(() => {
    reload();
  }, [messageId]);
  if (!poll) return null;

  const total = poll.total_votes || poll.answers.reduce((a, x) => a + x.count, 0);

  async function vote(answerId: string, voted: boolean) {
    try {
      if (voted) await api.polls.unvote(poll!.id, answerId);
      else await api.polls.vote(poll!.id, answerId);
      reload();
    } catch {}
  }

  return (
    <View style={s.card}>
      <Text style={s.q}>📊 {poll.question}</Text>
      {poll.answers.map((a) => {
        const pct = total ? Math.round((a.count / total) * 100) : 0;
        return (
          <TouchableOpacity
            key={a.id}
            style={[s.ans, a.me_voted && s.ansVoted]}
            disabled={poll.expired}
            onPress={() => vote(a.id, a.me_voted)}
          >
            <View style={[s.bar, { width: `${pct}%` }]} />
            <Text style={s.ansText}>
              {a.emoji ? a.emoji + ' ' : ''}
              {a.answer_text}
              {a.me_voted ? '  ✓' : ''}
            </Text>
            <Text style={s.pct}>
              {a.count} · {pct}%
            </Text>
          </TouchableOpacity>
        );
      })}
      <View style={s.foot}>
        <Text style={s.total}>
          {poll.expired ? t('poll.votesClosed', { n: total }) : t('poll.votesCount', { n: total })}
        </Text>
        {!poll.expired && poll.created_by === meId && (
          <TouchableOpacity
            onPress={async () => {
              try {
                await api.polls.close(poll!.id);
                reload();
              } catch {}
            }}
          >
            <Text style={s.close}>Kapat</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface2,
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.line,
  },
  q: { color: colors.ink, fontSize: 15, fontWeight: '800', marginBottom: 10 },
  ans: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 9,
    backgroundColor: colors.surface3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ansVoted: { borderWidth: 1, borderColor: colors.brand },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.brand + '33' },
  ansText: { color: colors.ink, fontSize: 14, flex: 1 },
  pct: { color: colors.inkSecondary, fontSize: 12, fontWeight: '700', marginLeft: 8 },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  total: { color: colors.inkTertiary, fontSize: 12 },
  close: { color: colors.accent, fontSize: 13, fontWeight: '700' },
});

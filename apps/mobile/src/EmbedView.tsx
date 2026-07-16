// Link/embed önizleme — mesajdaki linkler için sunucudan embed çekip kart gösterir.
import { useEffect, useState } from 'react';
import { Text, Image, Linking, TouchableOpacity, StyleSheet, View } from 'react-native';
import { colors } from './theme';
import { api, type Embed } from './api';

export function EmbedView({ messageId }: { messageId: string }) {
  const [embeds, setEmbeds] = useState<Embed[]>([]);
  useEffect(() => {
    let c = false;
    api.messages
      .embeds(messageId)
      .then((e) => {
        if (!c) setEmbeds(e);
      })
      .catch(() => {});
    return () => {
      c = true;
    };
  }, [messageId]);
  if (!embeds.length) return null;
  return (
    <View>
      {embeds.map((e) => (
        <TouchableOpacity
          key={e.id}
          style={s.card}
          onPress={() => Linking.openURL(e.url).catch(() => {})}
        >
          {!!e.site_name && <Text style={s.site}>{e.site_name}</Text>}
          {!!e.title && <Text style={s.title}>{e.title}</Text>}
          {!!e.description && (
            <Text style={s.desc} numberOfLines={3}>
              {e.description}
            </Text>
          )}
          {!!e.image_url && (
            <Image source={{ uri: e.image_url }} style={s.img} resizeMode="cover" />
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface2,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
  },
  site: { color: colors.inkTertiary, fontSize: 11 },
  title: { color: colors.brand, fontSize: 14, fontWeight: '700', marginTop: 2 },
  desc: { color: colors.inkSecondary, fontSize: 13, marginTop: 3 },
  img: {
    width: '100%',
    height: 150,
    borderRadius: 6,
    marginTop: 8,
    backgroundColor: colors.surface3,
  },
});

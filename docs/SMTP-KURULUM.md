# SMTP / E-posta Kurulumu — `no-reply@concord.app`

Concord'un şifre sıfırlama ve e-posta doğrulama mailleri buradan gönderilir. Bu rehber,
**kişisel Gmail yerine profesyonel bir kurulumu** (kendi domain + transactional mail servisi)
adım adım anlatır.

> **Kod tarafı hazır.** `mailer` paketi herhangi bir SMTP sağlayıcısıyla çalışır (gerçek TLS
> gönderimi testlerle kanıtlandı: `internal/mailer/tls_send_test.go`, `real_smtp_test.go`).
> Sağlayıcı değiştirmek = yalnızca `.env`'deki `SMTP_*` değerlerini değiştirmek. Kod değişmez.

---

## Neden kişisel Gmail değil?

| Sorun           | Gmail (App Password)     | Transactional servis (Resend/SES/Postmark) |
| --------------- | ------------------------ | ------------------------------------------ |
| Günlük limit    | ~500 (Workspace ~2.000)  | 3.000–62.000+                              |
| Deliverability  | Düşük — sık spam'e düşer | Yüksek (özel IP + DKIM/DMARC)              |
| Gönderen adresi | `sen@gmail.com`          | `no-reply@concord.app` (profesyonel)       |
| Google ToS      | Bulk için uygun değil    | Bunun için tasarlandı                      |

Gmail **dev/demo için geçici** olarak iş görür (en altta), ama gerçek kullanıcıya çıkacak
bir üründe transactional servis şarttır.

---

## İki farklı ihtiyaç — hangisi lazım?

- **Mail GÖNDERME** (şifre sıfırlama, doğrulama): Concord'un tek ihtiyacı bu. Transactional
  servis (Resend/SES/Postmark) yeterli. Gerçek posta kutusu GEREKMEZ.
- **Mail ALMA** (`info@concord.app`'e gelenleri okumak): Ayrı bir ihtiyaç. Google Workspace
  veya Zoho Mail gerektirir (~6 $/kullanıcı/ay). Şimdilik gerekmiyor — ileride müşteri
  iletişimi istersen eklenir.

Bu rehber **gönderme** kurulumunu anlatır (Concord'un ihtiyacı).

---

## Adım 1 — Domain al

`no-reply@concord.app` için önce `concord.app` domain'ine sahip olmalısın.

- Kayıt yeri: Cloudflare Registrar (maliyetine satar, en ucuz), Namecheap, Google Domains
- Fiyat: `.com` ~10–13 $/yıl, `.app` ~14 $/yıl, `.chat`/`.im` benzeri
- `concord.com` muhtemelen dolu → `concord.app`, `getconcord.com`, `concord.chat`, `concord.im`

> **Bunu sen yapmalısın** — ödeme + hesap gerektirir, ben senin adına satın alamam.

---

## Adım 2 — Mail servisi seç

| Servis         | Ücretsiz katman               | Güçlü yönü                          | Kurulum zorluğu               |
| -------------- | ----------------------------- | ----------------------------------- | ----------------------------- |
| **Resend**     | 3.000 mail/ay                 | En kolay kurulum, geliştirici dostu | ⭐ Kolay                      |
| **Amazon SES** | ~62.000 mail/ay (kalıcı ucuz) | En ucuz ölçek                       | ⭐⭐ Orta (sandbox'tan çıkış) |
| **Postmark**   | 100 mail/ay                   | En yüksek deliverability            | ⭐ Kolay                      |

**Öneri:** Başlangıç + kolaylık için **Resend**. Büyük ölçek/maliyet için **SES**.

---

## Adım 3 — Domain doğrula + DNS kayıtları (DKIM / SPF / DMARC)

Servis sana birkaç DNS kaydı verir; bunları domain panelinden (Adım 1'deki registrar) eklersin.
Bu kayıtlar mailin **spam'e düşmemesi** için kritiktir:

- **SPF** (TXT kaydı): "bu domain adına şu sunucular mail gönderebilir" der. Sahte gönderimi
  engeller.
- **DKIM** (TXT/CNAME): giden her maili kriptografik imzalar. Alıcı, mailin gerçekten
  senin domain'inden geldiğini ve yolda değiştirilmediğini doğrular.
- **DMARC** (TXT `_dmarc.concord.app`): SPF/DKIM başarısız olursa ne yapılacağını söyler
  (`p=none` başlangıç → izle; sonra `p=quarantine`/`p=reject`).

Örnek (Resend'in vereceği tipik kayıtlar — SEN kendi panelinden gerçek değerleri girersin):

```
Tür    Ad                          Değer
TXT    concord.app                 v=spf1 include:amazonses.com ~all
CNAME  resend._domainkey...        <resend'in verdiği>
TXT    _dmarc.concord.app          v=DMARC1; p=none; rua=mailto:dmarc@concord.app
```

Servis panelinde "Verify" bastığında yeşile dönmeli (DNS yayılımı birkaç dk–birkaç saat).

> **Bu adımda takılırsan** DNS kayıtlarını bana yapıştır, hangisinin nereye gireceğini
> tek tek yönlendiririm.

---

## Adım 4 — `.env`'i ayarla

Servisin verdiği credential'ı `.env`'e gir. `.env`'de her sağlayıcı için hazır yorumlu blok var
(Resend/SES/Postmark) — ilgili bloğun `#`'lerini kaldırıp değerleri doldur. Örnek (Resend):

```bash
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_...              # Resend → API Keys → oluştur
SMTP_REQUIRE_TLS=true         # ÜRETİMDE ZORUNLU (MustSecure kontrol eder)
MAIL_FROM=Concord <no-reply@concord.app>
```

> `SMTP_REQUIRE_TLS=true` production'da zorunludur — şifresiz bağlantıda şifre sıfırlama
> bağlantısı düz metin gider. `config.MustSecure` bunu prod'da şart koşar.

---

## Adım 5 — Test et

Credential'ı girdikten sonra gerçek gönderimi doğrula:

```bash
# API'yi .env ile başlat, sonra kendine bir şifre sıfırlama tetikle:
curl -X POST http://localhost:8080/api/v1/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"KENDI_KAYITLI_ADRESIN"}'
```

Mail birkaç saniyede gerçek inbox'a düşmeli. Düşmezse:

- Servis panelindeki "Activity/Logs" bölümüne bak (reddedildi mi, spam mi)
- DKIM/SPF yeşil mi kontrol et (Adım 3)
- `SMTP_REQUIRE_TLS=true` ve doğru port (587) mü

> Credential'ı verirsen bu testi ben de çalıştırıp sonucu gösteririm.

---

## Dev / geçici alternatif

- **Dev (varsayılan):** MailHog — `.env`'de `SMTP_HOST=localhost:1025`, mailler
  http://localhost:8025 arayüzünde yakalanır, gerçek gönderim yok. Kurulum gerektirmez.
- **Hızlı gerçek test (geçici):** Gmail App Password — `.env`'deki Gmail bloğu. ~500/gün
  limit, prod-grade değil, ama demo için çalışır. 2FA açıp
  https://myaccount.google.com/apppasswords adresinden 16 haneli kod alınır.

---

## Özet karar

- **Ciddi/kalıcı ürün** → Adım 1–5 (domain + Resend/SES). Birkaç saatlik kurulum, profesyonel
  sonuç, `no-reply@concord.app`.
- **Şimdilik sadece test/demo** → MailHog (dev) veya Gmail App Password (geçici). Sonra
  yukarıdaki profesyonel yola geçiş sadece `.env` değişikliğidir — kod aynı kalır.

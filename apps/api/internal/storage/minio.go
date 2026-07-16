// Concord obje deposu — geliştirme: MinIO, prod: Cloudflare R2 (S3 uyumlu)
package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Storage struct {
	client *minio.Client
	bucket string
	public string // CDN/public URL prefix
}

func New(ctx context.Context) (*Storage, error) {
	endpoint := getenv("MINIO_ENDPOINT", "localhost:9000")
	accessKey := getenv("MINIO_ACCESS_KEY", "concord")
	secretKey := getenv("MINIO_SECRET_KEY", "concord_dev_minio")
	bucket := getenv("MINIO_BUCKET", "concord-uploads")
	useSSL := getenv("MINIO_SSL", "false") == "true"
	publicBase := getenv("MINIO_PUBLIC_BASE", "http://localhost:9000")

	cli, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, err
	}

	// Bucket'i kontrol et / oluştur
	ok, err := cli.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("bucket check: %w", err)
	}
	if !ok {
		if err := cli.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("bucket create: %w", err)
		}
		// Public read policy
		policy := fmt.Sprintf(`{
			"Version":"2012-10-17",
			"Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::%s/*"]}]
		}`, bucket)
		_ = cli.SetBucketPolicy(ctx, bucket, policy)
	}

	return &Storage{
		client: cli,
		bucket: bucket,
		public: publicBase,
	}, nil
}

// PresignedPut — istemcinin doğrudan upload edebilmesi için imzalı URL
func (s *Storage) PresignedPut(ctx context.Context, key string, expiry time.Duration) (string, error) {
	u, err := s.client.PresignedPutObject(ctx, s.bucket, key, expiry)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

// PresignedGet — okuma için imzalı URL
func (s *Storage) PresignedGet(ctx context.Context, key string, expiry time.Duration) (string, error) {
	reqParams := url.Values{}
	u, err := s.client.PresignedGetObject(ctx, s.bucket, key, expiry, reqParams)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

// PublicURL — bucket public read açıksa direkt URL
func (s *Storage) PublicURL(key string) string {
	return fmt.Sprintf("%s/%s/%s", s.public, s.bucket, key)
}

func (s *Storage) Bucket() string { return s.bucket }

func getenv(k, fallback string) string {
	if v, ok := os.LookupEnv(k); ok {
		return v
	}
	return fallback
}

// GetObject — nesnenin baytlarını okur. Medya webhook'u işleme için kullanır: dosya
// istemciden DOĞRUDAN MinIO'ya gittiği için API baytları başka türlü hiç görmez.
// maxBytes'tan büyük nesnelerde hata döner (bellek koruması).
func (s *Storage) GetObject(ctx context.Context, key string, maxBytes int64) ([]byte, error) {
	info, err := s.client.StatObject(ctx, s.bucket, key, minio.StatObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("stat %s: %w", key, err)
	}
	if maxBytes > 0 && info.Size > maxBytes {
		return nil, fmt.Errorf("nesne çok büyük: %d bayt (sınır %d)", info.Size, maxBytes)
	}
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("get %s: %w", key, err)
	}
	defer obj.Close()
	// LimitReader: StatObject ile GetObject arasında nesne değişmiş olabilir
	data, err := io.ReadAll(io.LimitReader(obj, maxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", key, err)
	}
	if maxBytes > 0 && int64(len(data)) > maxBytes {
		return nil, fmt.Errorf("nesne çok büyük (okuma sırasında): sınır %d", maxBytes)
	}
	return data, nil
}

// PutVariant — türetilmiş bir nesne yazar (ör. thumbnail). Anahtar çakışmasını önlemek için
// çağıran VariantKey ile üretmeli.
func (s *Storage) PutVariant(ctx context.Context, key, contentType string, data []byte) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: contentType})
	if err != nil {
		return fmt.Errorf("put %s: %w", key, err)
	}
	return nil
}

// VariantKey — bir nesnenin türev anahtarı: "a/b/dosya.png" + "thumb" → "a/b/dosya.thumb.jpg".
// Türevler aynı önekte kalır (bucket policy/lifecycle tek yerden yönetilsin).
func VariantKey(key, variant, ext string) string {
	base := key
	if i := strings.LastIndex(key, "."); i > strings.LastIndex(key, "/") && i != -1 {
		base = key[:i]
	}
	return base + "." + variant + ext
}

// RemoveObject — reddedilen/enfekte nesneyi depodan siler.
func (s *Storage) RemoveObject(ctx context.Context, key string) error {
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}

// KeyFromPublicURL — PublicURL'in tersi: "{public}/{bucket}/{key}" → key.
// Bu depoya ait olmayan URL'lerde ok=false döner (istemcinin gönderdiği rastgele bir
// dış URL'i nesne anahtarı sanmayalım).
func (s *Storage) KeyFromPublicURL(u string) (string, bool) {
	prefix := s.public + "/" + s.bucket + "/"
	if !strings.HasPrefix(u, prefix) {
		return "", false
	}
	key := strings.TrimPrefix(u, prefix)
	if key == "" || strings.Contains(key, "..") {
		return "", false
	}
	return key, true
}

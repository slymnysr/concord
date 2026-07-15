// Concord obje deposu — geliştirme: MinIO, prod: Cloudflare R2 (S3 uyumlu)
package storage

import (
	"context"
	"fmt"
	"net/url"
	"os"
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

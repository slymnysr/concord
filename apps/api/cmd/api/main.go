package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/concord/api/internal/auth"
	"github.com/concord/api/internal/config"
	"github.com/concord/api/internal/db"
	"github.com/concord/api/internal/handlers"
	"github.com/concord/api/internal/router"
	"github.com/concord/api/internal/snowflake"
	"github.com/concord/api/internal/storage"
	"go.uber.org/zap"
)

func main() {
	logger, err := zap.NewProduction()
	if err != nil {
		log.Fatalf("logger init: %v", err)
	}
	defer logger.Sync()

	cfg := config.Load()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := db.New(ctx, cfg.PostgresDSN)
	if err != nil {
		logger.Fatal("postgres bağlantı", zap.Error(err))
	}
	defer pool.Close()
	logger.Info("postgres bağlandı")

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
	})
	if err := rdb.Ping(ctx).Err(); err != nil {
		logger.Fatal("redis bağlantı", zap.Error(err))
	}
	defer rdb.Close()
	logger.Info("redis bağlandı")

	ids, err := snowflake.New(cfg.WorkerID)
	if err != nil {
		logger.Fatal("snowflake init", zap.Error(err))
	}
	iss := auth.NewIssuer(cfg.JWTSecret)

	store, err := storage.New(ctx)
	if err != nil {
		logger.Warn("storage init başarısız, uploads kapalı", zap.Error(err))
		store = nil
	} else {
		logger.Info("storage hazır", zap.String("bucket", store.Bucket()))
	}

	h := handlers.New(logger, cfg, pool, rdb, ids, iss, store)
	r := router.New(h, iss)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("concord-api başlatılıyor", zap.String("port", cfg.Port))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Fatal("sunucu hatası", zap.Error(err))
		}
	}()

	// Zamanlanmış mesaj dağıtıcısı — her 20 saniyede vakti gelenleri gönderir
	go func() {
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.DispatchDueScheduledMessages(ctx)
				h.DispatchDueReminders(ctx)
				h.ClearExpiredCustomStatuses(ctx)
				h.DispatchDueEventReminders(ctx)
			}
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("kapanış sinyali alındı")
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown başarısız", zap.Error(err))
	}
	logger.Info("kapatıldı")
}

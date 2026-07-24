// Concord Snowflake — Discord-stili 64-bit dağıtık ID üretici.
// Layout:
//
//	1 bit (her zaman 0) | 42 bit timestamp (ms) | 10 bit worker_id | 11 bit sequence
//
// Bizim epoch: 2026-01-01 00:00 UTC
package snowflake

import (
	"errors"
	"sync"
	"time"
)

const (
	Epoch        int64 = 1767225600000 // 2026-01-01 00:00:00 UTC ms
	workerBits         = 10
	sequenceBits       = 11
	maxWorker          = (1 << workerBits) - 1
	maxSequence        = (1 << sequenceBits) - 1
	timeShift          = workerBits + sequenceBits
	workerShift        = sequenceBits
)

type Generator struct {
	mu       sync.Mutex
	workerID int64
	lastMs   int64
	seq      int64
}

func New(workerID int64) (*Generator, error) {
	if workerID < 0 || workerID > maxWorker {
		return nil, errors.New("snowflake: workerID aralık dışı (0-1023)")
	}
	return &Generator{workerID: workerID}, nil
}

func (g *Generator) Next() int64 {
	g.mu.Lock()
	defer g.mu.Unlock()

	now := time.Now().UnixMilli() - Epoch
	if now == g.lastMs {
		g.seq = (g.seq + 1) & maxSequence
		if g.seq == 0 {
			for now <= g.lastMs {
				now = time.Now().UnixMilli() - Epoch
			}
		}
	} else {
		g.seq = 0
	}
	g.lastMs = now

	return (now << timeShift) | (g.workerID << workerShift) | g.seq
}

// Parse — ID'den zaman damgası, worker, sequence çıkar (telemetri için)
func Parse(id int64) (ts time.Time, worker, seq int64) {
	ms := (id >> timeShift) + Epoch
	worker = (id >> workerShift) & maxWorker
	seq = id & maxSequence
	ts = time.UnixMilli(ms)
	return
}

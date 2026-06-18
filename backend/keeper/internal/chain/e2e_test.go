package chain

import (
	"context"
	"encoding/hex"
	"math/big"
	"os/exec"
	"testing"
	"time"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

// Init bytecode of a minimal Recorder { address last; function liquidate(address) } compiled with
// solc 0.8.24. Lets the e2e test prove the real submission path without deploying the full protocol.
const recorderBytecode = "608060405234801561000f575f80fd5b506101be8061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c80632f8655681461003857806347799da814610054575b5f80fd5b610052600480360381019061004d9190610135565b610072565b005b61005c6100b4565b604051610069919061016f565b60405180910390f35b805f806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f80fd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f610104826100db565b9050919050565b610114816100fa565b811461011e575f80fd5b50565b5f8135905061012f8161010b565b92915050565b5f6020828403121561014a576101496100d7565b5b5f61015784828501610121565b91505092915050565b610169816100fa565b82525050565b5f6020820190506101825f830184610160565b9291505056fea264697066735822122092d6412deccd080c9fcc7bd83723c787f702b25458125c60b1783054977fc18464736f6c63430008180033"

// Anvil's first dev account, funded and deterministic.
const (
	devKey  = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	rpcURL  = "http://127.0.0.1:8599"
	rpcPort = "8599"
)

// TestLiquidateSubmitsOnChain spins up anvil, deploys the recorder, and proves the keeper client
// actually lands liquidate(account) on chain. Skips when anvil is unavailable (e.g. CI).
func TestLiquidateSubmitsOnChain(t *testing.T) {
	if _, err := exec.LookPath("anvil"); err != nil {
		t.Skip("anvil not installed; skipping on-chain e2e")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	anvil := exec.CommandContext(ctx, "anvil", "--port", rpcPort, "--silent")
	if err := anvil.Start(); err != nil {
		t.Fatalf("start anvil: %v", err)
	}
	defer func() { _ = anvil.Process.Kill() }()

	eth := waitForRPC(t, ctx)
	defer eth.Close()

	recorder := deployRecorder(t, ctx, eth)

	client, err := Dial(ctx, rpcURL, devKey, recorder.Hex(), recorder.Hex())
	if err != nil {
		t.Fatalf("dial keeper client: %v", err)
	}

	account := "0x00000000000000000000000000000000000000A1"
	txHash, err := client.Liquidate(ctx, account)
	if err != nil {
		t.Fatalf("Liquidate: %v", err)
	}
	waitMined(t, ctx, eth, common.HexToHash(txHash))

	if got := readLast(t, ctx, eth, recorder); got != common.HexToAddress(account) {
		t.Fatalf("recorder.last = %s, want %s", got.Hex(), account)
	}
}

func waitForRPC(t *testing.T, ctx context.Context) *ethclient.Client {
	t.Helper()
	for {
		if ctx.Err() != nil {
			t.Fatal("anvil did not become ready")
		}
		eth, err := ethclient.DialContext(ctx, rpcURL)
		if err == nil {
			if _, err := eth.ChainID(ctx); err == nil {
				return eth
			}
			eth.Close()
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func deployRecorder(t *testing.T, ctx context.Context, eth *ethclient.Client) common.Address {
	t.Helper()
	code, err := hex.DecodeString(recorderBytecode)
	if err != nil {
		t.Fatalf("decode bytecode: %v", err)
	}
	key, _ := crypto.HexToECDSA(devKey)
	from := crypto.PubkeyToAddress(key.PublicKey)

	chainID, _ := eth.ChainID(ctx)
	nonce, _ := eth.PendingNonceAt(ctx, from)
	tip, _ := eth.SuggestGasTipCap(ctx)
	head, _ := eth.HeaderByNumber(ctx, nil)
	gas, err := eth.EstimateGas(ctx, ethereum.CallMsg{From: from, Data: code})
	if err != nil {
		t.Fatalf("estimate deploy gas: %v", err)
	}

	tx := types.NewTx(&types.DynamicFeeTx{
		ChainID:   chainID,
		Nonce:     nonce,
		GasTipCap: tip,
		GasFeeCap: new(big.Int).Add(new(big.Int).Mul(head.BaseFee, big.NewInt(2)), tip),
		Gas:       gas * 12 / 10,
		Data:      code,
	})
	signed, err := types.SignTx(tx, types.LatestSignerForChainID(chainID), key)
	if err != nil {
		t.Fatalf("sign deploy: %v", err)
	}
	if err := eth.SendTransaction(ctx, signed); err != nil {
		t.Fatalf("send deploy: %v", err)
	}
	receipt := waitMined(t, ctx, eth, signed.Hash())
	return receipt.ContractAddress
}

func waitMined(t *testing.T, ctx context.Context, eth *ethclient.Client, hash common.Hash) *types.Receipt {
	t.Helper()
	for {
		if ctx.Err() != nil {
			t.Fatalf("tx %s not mined", hash.Hex())
		}
		receipt, err := eth.TransactionReceipt(ctx, hash)
		if err == nil {
			return receipt
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func readLast(t *testing.T, ctx context.Context, eth *ethclient.Client, recorder common.Address) common.Address {
	t.Helper()
	selector := crypto.Keccak256([]byte("last()"))[:4]
	out, err := eth.CallContract(ctx, ethereum.CallMsg{To: &recorder, Data: selector}, nil)
	if err != nil {
		t.Fatalf("read last(): %v", err)
	}
	return common.BytesToAddress(out)
}

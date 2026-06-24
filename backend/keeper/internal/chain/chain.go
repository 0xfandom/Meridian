// Package chain implements on-chain health reads and liquidation submission over JSON-RPC.
package chain

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"strings"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

var (
	liquidateSelector = crypto.Keccak256([]byte("liquidate(address)"))[:4]
	healthSelector    = crypto.Keccak256([]byte("calcHealthFactor(address)"))[:4]
)

// Client submits liquidations to the LiquidationModule and reads account health from the
// CreditManager, signing transactions with the keeper key.
type Client struct {
	eth           *ethclient.Client
	key           *ecdsa.PrivateKey
	from          common.Address
	module        common.Address
	creditManager common.Address
}

// Dial connects to an RPC endpoint and prepares the keeper client.
func Dial(ctx context.Context, rpcURL, privHex, moduleHex, creditManagerHex string) (*Client, error) {
	eth, err := ethclient.DialContext(ctx, rpcURL)
	if err != nil {
		return nil, fmt.Errorf("dial rpc: %w", err)
	}
	key, err := crypto.HexToECDSA(strings.TrimPrefix(privHex, "0x"))
	if err != nil {
		return nil, fmt.Errorf("parse key: %w", err)
	}
	return &Client{
		eth:           eth,
		key:           key,
		from:          crypto.PubkeyToAddress(key.PublicKey),
		module:        common.HexToAddress(moduleHex),
		creditManager: common.HexToAddress(creditManagerHex),
	}, nil
}

// From is the keeper's address.
func (c *Client) From() common.Address { return c.from }

// Eth exposes the underlying client for read-only helpers and tests.
func (c *Client) Eth() *ethclient.Client { return c.eth }

// HealthFactor reads calcHealthFactor(account) from the given market's credit manager and returns
// it in WAD. An empty creditManager falls back to the client's default (the primary market).
func (c *Client) HealthFactor(ctx context.Context, account, creditManager string) (*big.Int, error) {
	target := c.creditManager
	if creditManager != "" {
		target = common.HexToAddress(creditManager)
	}
	data := append(append([]byte{}, healthSelector...), padAddress(common.HexToAddress(account))...)
	out, err := c.eth.CallContract(ctx, ethereum.CallMsg{To: &target, Data: data}, nil)
	if err != nil {
		return nil, fmt.Errorf("calcHealthFactor: %w", err)
	}
	return new(big.Int).SetBytes(out), nil
}

// Liquidate submits liquidate(account) to the given market's liquidation module and returns the
// transaction hash. An empty liquidationModule falls back to the client's default (the primary
// market).
func (c *Client) Liquidate(ctx context.Context, account, liquidationModule string) (string, error) {
	target := c.module
	if liquidationModule != "" {
		target = common.HexToAddress(liquidationModule)
	}
	data := append(append([]byte{}, liquidateSelector...), padAddress(common.HexToAddress(account))...)
	return c.send(ctx, target, data)
}

func (c *Client) send(ctx context.Context, to common.Address, data []byte) (string, error) {
	chainID, err := c.eth.ChainID(ctx)
	if err != nil {
		return "", fmt.Errorf("chain id: %w", err)
	}
	nonce, err := c.eth.PendingNonceAt(ctx, c.from)
	if err != nil {
		return "", fmt.Errorf("nonce: %w", err)
	}
	tip, err := c.eth.SuggestGasTipCap(ctx)
	if err != nil {
		return "", fmt.Errorf("gas tip: %w", err)
	}
	head, err := c.eth.HeaderByNumber(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("head: %w", err)
	}
	maxFee := new(big.Int).Add(new(big.Int).Mul(head.BaseFee, big.NewInt(2)), tip)

	gas, err := c.eth.EstimateGas(ctx, ethereum.CallMsg{From: c.from, To: &to, Data: data})
	if err != nil {
		return "", fmt.Errorf("estimate gas: %w", err)
	}

	tx := types.NewTx(&types.DynamicFeeTx{
		ChainID:   chainID,
		Nonce:     nonce,
		GasTipCap: tip,
		GasFeeCap: maxFee,
		Gas:       gas * 12 / 10,
		To:        &to,
		Data:      data,
	})
	signed, err := types.SignTx(tx, types.LatestSignerForChainID(chainID), c.key)
	if err != nil {
		return "", fmt.Errorf("sign: %w", err)
	}
	if err := c.eth.SendTransaction(ctx, signed); err != nil {
		return "", fmt.Errorf("send: %w", err)
	}
	return signed.Hash().Hex(), nil
}

func padAddress(addr common.Address) []byte {
	padded := make([]byte, 32)
	copy(padded[12:], addr.Bytes())
	return padded
}

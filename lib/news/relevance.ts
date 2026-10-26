/** A linked post is shown only when its text is about a coin or the market. */
export function mentionsMarket(text: string): boolean {
  return /\b(crypto|memecoins?|meme\s*coins?|solana|bitcoin|btc|ethereum|eth|pump\.?fun|tokens?|coins?|dex|liquidity|market\s*cap|on-?chain|airdrops?|launchpads?|nfts?|defi|traders?|trading|volume|ticker|mint)\b/i.test(text);
}

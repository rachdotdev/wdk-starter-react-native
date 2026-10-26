/** @type {import('@tetherto/wdk-worklet-bundler').WdkBundleConfig} */
module.exports = {
  networks: {
    bitcoin: {
      package: '@tetherto/wdk-wallet-btc'
    },
    spark: {
      package: '@tetherto/wdk-wallet-spark'
    },
    // Ethereum points at the network set in .env (mainnet for the swap demo).
    // There is deliberately no separate 'sepolia' network key anymore, since
    // that would be redundant.
    ethereum: {
      package: '@tetherto/wdk-wallet-evm-7702-gasless'
    },
    arbitrum: {
      package: '@tetherto/wdk-wallet-evm-7702-gasless'
    },
    polygon: {
      package: '@tetherto/wdk-wallet-evm-7702-gasless'
    },
    solana: {
      package: '@tetherto/wdk-wallet-solana'
    }
    // tron: still on hold — see config.ts's comment.
  },
  // One LI.FI swap/bridge protocol per EVM network. The key must match the
  // `protocolName` used in wdk/networks.ts (`lifi-<network>`).
  protocols: {
    'lifi-ethereum': { package: '@starter/wdk-protocol-swidge-lifi-gasless' },
    'lifi-arbitrum': { package: '@starter/wdk-protocol-swidge-lifi-gasless' },
    'lifi-polygon': { package: '@starter/wdk-protocol-swidge-lifi-gasless' },
    'symbiosis-ethereum': { package: '@symbiosis-finance/wdk-protocol-swidge-symbiosis' },
    'symbiosis-arbitrum': { package: '@symbiosis-finance/wdk-protocol-swidge-symbiosis' },
    'symbiosis-polygon': { package: '@symbiosis-finance/wdk-protocol-swidge-symbiosis' },
    'zerox-ethereum': { package: '@0x/wdk-protocol-swidge-0x' },
    'zerox-arbitrum': { package: '@0x/wdk-protocol-swidge-0x' },
    'zerox-polygon': { package: '@0x/wdk-protocol-swidge-0x' },
    'rhinofi-ethereum': { package: '@starter/wdk-protocol-swidge-rhinofi-gasless' },
    'rhinofi-arbitrum': { package: '@starter/wdk-protocol-swidge-rhinofi-gasless' },
    'rhinofi-polygon': { package: '@starter/wdk-protocol-swidge-rhinofi-gasless' },
    'morpho-savings': { package: '@starter/wdk-protocol-lending-morpho-gasless' },
    'morpho-risk': { package: '@starter/wdk-protocol-lending-morpho-gasless' }
  },
  // Only the methods the app actually calls, so the bundle can't invoke
  // anything else on the swap protocol.
  allowedMethods: {
    ethereum: { protocols: { lending: { 'morpho-savings': { methods: ['getVaultPosition', 'getMarketPosition', 'getAccountData', 'deposit', 'withdrawFromVault', 'depositCollateral', 'borrowAgainstCollateral'] }, 'morpho-risk': { methods: ['getVaultPosition', 'getMarketPosition', 'getAccountData', 'deposit', 'withdrawFromVault'] } }, swidge: { 'lifi-ethereum': { methods: ['quoteSwidge', 'swidge', 'getSwidgeStatus'] }, 'symbiosis-ethereum': { methods: ['quoteSwidge', 'swidge', 'getSwidgeStatus'] }, 'zerox-ethereum': { methods: ['quoteSwidge', 'swidge', 'getSwidgeStatus'] }, 'rhinofi-ethereum': { methods: ['quoteSwidge', 'swidge', 'getSwidgeStatus'] } } } },
    arbitrum: { protocols: { swidge: { 'lifi-arbitrum': { methods: ['quoteSwidge', 'swidge', 'getSwidgeStatus'] }, 'symbiosis-arbitrum': { methods: ['quoteSwidge', 'swidge', 'getSwidgeStatus'] }, 'zerox-arbitrum': { methods: ['quoteSwidge', 'swidge', 'getSwidgeStatus'] }, 'rhinofi-arbitrum': { methods: ['quoteSwidge', 'swidge', 'getSwidgeStatus'] } } } },
    polygon: { protocols: { swidge: { 'lifi-polygon': { methods: ['quoteSwidge', 'swidge', 'getSwidgeStatus'] }, 'symbiosis-polygon': { methods: ['quoteSwidge', 'swidge', 'getSwidgeStatus'] }, 'zerox-polygon': { methods: ['quoteSwidge', 'swidge', 'getSwidgeStatus'] }, 'rhinofi-polygon': { methods: ['quoteSwidge', 'swidge', 'getSwidgeStatus'] } } } }
  },
  preloadModules: [
    '@buildonspark/spark-frost-bare-addon'
  ]
}

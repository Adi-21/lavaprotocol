/* eslint-disable no-console */
const hre = require('hardhat')

async function main() {
    try {
        const bn = await hre.ethers.provider.getBlockNumber()
        const net = await hre.ethers.provider.send('net_version', [])
        const chainId = await hre.ethers.provider.send('eth_chainId', [])
        console.log('Citrea RPC OK')
        console.log('blockNumber:', bn)
        console.log('net_version:', net)
        console.log('chainId:', chainId)
        process.exit(0)
    } catch (e) {
        console.error('Citrea RPC ERROR:', e?.shortMessage || e?.message || e)
        process.exit(1)
    }
}

main()



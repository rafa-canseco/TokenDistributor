import {ethers} from "ethers"
import * as dotenv from "dotenv"
import {Token__factory} from "../typechain-types"
dotenv.config()

function setUpProvider () {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_ENDPOINT_MAINNET ?? "");
    return provider
}

async function main() {
    const provider = setUpProvider()
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_ANDRES ?? "", provider);
    console.log("Deploying Contract")
    const walletAddress = await wallet.getAddress();
    
    const tokenFactory = new Token__factory(wallet);
    const token = await tokenFactory.deploy(walletAddress);
    const deploymentTransaction = token.deploymentTransaction();
    await deploymentTransaction?.wait(5);
    await token.waitForDeployment();
    console.log("Contract deployed")

    const tokenContractAdress = await token.getAddress();
    console.log("CA:",tokenContractAdress);

}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
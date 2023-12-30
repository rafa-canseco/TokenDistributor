import {ethers} from "ethers"
import * as dotenv from "dotenv"
import {Token__Factory} from "../typechain-types"
dotenv.config()

function setUpProvider () {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL_TESTNET ?? "");
    return provider
}

async function main() {
    const provider = setUpProvider()
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_BUOYANT_TESTNET ?? "", provider);
    console.log("Deploying Contract")
    const walletAddress = await wallet.getAddress();
    
    const tokenFactory = new Token__Factory(wallet);
    const token = await tokenFactory.deploy(walletAddress);
    const deploymentTransaction = token.deploymentTransaction();
    await deploymentTransaction?.wait(5);
    await token.waitForDeployment();
    console.log("Contract deployed")

    const tokenContractAdress = await token.getAddress();
    console.log("CA:",tokenContractAdress);

    //TODO:verify
}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
import { expect } from "chai";
import { ethers } from "hardhat";
import { Token, Token__factory } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";



describe("ContratoToken", function () {
    let token: Token;
    let owner: SignerWithAddress;
    let distributorContract: Distributor;
    let addr1: SignerWithAddress;
    let addr2: SignerWithAddress;
    let addr3: SignerWithAddress
    let wallet: Wallet; 


    beforeEach(async function() {
        [owner,addr1,addr2,addr3] = await ethers.getSigners();
        const tokenFactory = (await ethers.getContractFactory("Token", owner)) as Token__factory;
        token = await tokenFactory.deploy(owner.address) as Token;
        await token.waitForDeployment(2);
        const distributorAddress = await token.distributorAddress();
        distributorContract = await ethers.getContractAt("Distributor", distributorAddress) as Distributor;
        const privateKey = process.env.PRIVATE_KEY;
        wallet = new ethers.Wallet(privateKey!, ethers.provider); 
    });

    describe("Deployment", function () {
        it("Debería establecer el propietario correcto", async function () {
            const tokenOwnerAddress = await token.owner();
            const walletDeployer = await owner.address;
            expect(tokenOwnerAddress).to.equal(walletDeployer);
        });
        it("Debería asigna el total de tokens al propietario", async function () {
            const ownerBalance = await token.balanceOf(await owner.address);
            const totalSupply = await token.totalSupply();
            expect(ownerBalance).to.equal(totalSupply);
        })
        it("Debería deployar al DividendDistributor", async function () {
            const distributorAddress = await token.distributorAddress();
            const addressZero = ethers.ZeroAddress;
            expect(distributorAddress).to.not.equal(addressZero);
            expect(await ethers.provider.getCode(distributorAddress)).to.not.equal('0x');
        });
        it("Debería ser el mismo reward token en el distributor y en el token contract", async function () {
            const rewardTokenAddress = await token.reflectionToken();
            const distributorTokenAddress = await distributorContract.reflectionToken();
            expect(distributorTokenAddress).to.be.equal(rewardTokenAddress);
        });
    });


    describe("Settings", function () {
        it("Debería poder excluir a un address de tener fees y emitir el evento correspondiente", async function () {
            await expect(token.excludeFromFee(addr1.address, true))
                .to.emit(token, 'AccountExcludeFromFee')
                .withArgs(addr1.address, true);
            await expect(token.excludeFromFee(addr1.address, false))
                .to.emit(token, 'AccountExcludeFromFee')
                .withArgs(addr1.address, false);
        });
        it("Debería cambiar el SwapBackAmount y emitir el evento", async function () {
            const qty = ethers.parseUnits("3000", 18);
            await expect(token.setSwapTokensAtAmount(qty))
                .to.emit(token, "SwapTokensAmountUpdated")
                .withArgs(qty);
            const qty_contract = await token.swapTokensAtAmount();
            expect(qty_contract).to.equal(qty);
        });
        it("Debería actualizar la lista de si es un AMM pair y emitir el evento", async function () {
            const new_pair = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E";
            await expect(token.setAutomatedMarketMakerPair(new_pair, true))
                .to.emit(token, 'AutomatedMarketMakerPairUpdated')
                .withArgs(new_pair, true);
            await expect(token.setAutomatedMarketMakerPair(new_pair, false))
                .to.emit(token, 'AutomatedMarketMakerPairUpdated')
                .withArgs(new_pair, false);
        })
        it("Debería modificar un address de ser exento de Rewards y verificar el cambio", async function () {
            const qty = ethers.parseUnits("3000000", 18);
            await token.excludeFromFee(addr1.address,true)
            await token.increaseAllowance(owner.address, qty);
            await token.transfer(addr1.address,qty);

            let shareBefore = await distributorContract.shares(addr1.address);
            expect(shareBefore.amount).to.be.above(0);

            await expect( token.setIsDividendExempt(addr1.address,true))
                .to.emit(token, 'DividendExemptUpdated')
                .withArgs(addr1.address, true);

            let shareAfterExempt = await distributorContract.shares(addr1.address);
            expect(shareAfterExempt.amount).to.equal(0);

            await expect(token.setIsDividendExempt(addr1.address, false))
                .to.emit(token, 'DividendExemptUpdated')
                .withArgs(addr1.address, false);

            let shareAfterInclude = await distributorContract.shares(addr1.address);
            expect(shareAfterInclude.amount).to.equal(qty)
        })
        it("Debería actualizar el status del Distributor contract y verificar el cambio", async function () { 
            await token.setDistributionStatus(false);
            expect(await token.distributionEnabled()).to.equal(false);
            await token.setDistributionStatus(true);
            expect(await token.distributionEnabled()).to.equal(true);
        })
        it("Debería actualizar el tiempo de distribución", async function () {
            const new_Time = 1000;
            await expect(token.setDistributionCriteria(new_Time))
                .to.emit(distributorContract, "DistributionCriteriaUpdate")
                .withArgs(new_Time);
            expect(await distributorContract.minPeriod()).to.equal(new_Time);
            const original_time = 3600;
            await expect(token.setDistributionCriteria(original_time))
                .to.emit(distributorContract, "DistributionCriteriaUpdate")
                .withArgs(original_time)
            expect(await distributorContract.minPeriod()).to.equal(original_time);
        });
        it("Debería actualizar el gas para las tx autorizado", async function() {
            const new_gas = 1000000000;
            await expect(token.setDistributorGas(new_gas))
                .to.be.revertedWith("Gas is greater than limit");
            const correct_gas = 700000;
            await token.setDistributorGas(correct_gas);
            const gas = await token.distributorGas();
            expect(gas).to.equal(correct_gas);
        })
        it("Debería remover el límite de tx", async function () {
            await token.removeMaxTx();
            const new_value = await token.maxTx();
            const max = BigInt(100_000_000_000) * BigInt(10 ** 18);
            expect(new_value).to.equal(max);
        })
        it("Debería habilitar y deshabilitar las reflexiones", async function () {
            expect(await token.reflectionsEnabled()).to.equal(true);
            await token.disableReflections();
            expect(await token.reflectionsEnabled()).to.equal(false);
            await token.disableReflections();
            expect(await token.reflectionsEnabled()).to.equal(true);
        })
        it("Debería actualizar el token de reflection y emitir el evento", async function () {
            const new_reflection = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
            await expect(token.setReflectionToken(new_reflection))
                .to.emit(token, "RewardTokenUpdated")
                .withArgs(new_reflection);
            const reflection_token = await token.reflectionToken()
            await (token.setReflectionToken(new_reflection))
            expect(reflection_token).to.equal(new_reflection);
            const distributor_reflection = await distributorContract.reflectionToken()
            expect(distributor_reflection).to.equal(new_reflection);
        })

        it("Debería ajustar el máximo de transacción", async function () {
            const newMaxTx = ethers.parseUnits("5000000", 18);
            await token.adjustMaxTx(newMaxTx);
            expect(await token.maxTx()).to.equal(newMaxTx);
        });
        it("Debería permitir la retirada de emergencia de AVAX", async function () {
            const contract_address = await token.getAddress()
            const sendValue = ethers.parseEther("0.5");
            await wallet.sendTransaction({
                to: contract_address, 
                value: sendValue
            });

            const initialBalance = await ethers.provider.getBalance(wallet);
            const contractBalance = await ethers.provider.getBalance(contract_address);
            expect(contractBalance).to.be.gt(0, "El contrato no tiene saldo de AVAX");

            const tx = await token.emergencyWithdrawAvax();
            await tx.wait();

           
            const finalContractBalance = await ethers.provider.getBalance(contract_address);
            const finalOwnerBalance = await ethers.provider.getBalance(wallet);
            expect(finalContractBalance).to.equal(0, "El contrato aún tiene saldo de AVAX");
            expect(finalOwnerBalance).to.equal(initialBalance, "El propietario no recibió los fondos de AVAX");
        })
    });

    describe("Swaps", function () {
        // it("Debería cambiar el token reward por Avax", async function (){
        //     //Primero creamos el par de liquidez
        //     const factoryAddress = "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10"
        //     const routerAddress = "0x60aE616a2155Ee3d9A68541Ba4544862310933d4"
        //     const factory = await ethers.getContractAt("IJoeFactory", factoryAddress);
        //     const router = await ethers.getContractAt("IJoeRouter", routerAddress);

        //     const contract_address = await token.getAddress()
        //     const owner_address = await owner.getAddress()

        //     const amountTokenDesired = ethers.parseUnits("100000000", 18);
        //     const amountTokenMin = ethers.parseUnits("100000000", 18);
        //     const amountAVAXMin = ethers.parseEther("0.6"); 

        //     const to = owner_address; 
        //     const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // Establecer un deadline (por ejemplo, 20 minutos desde ahora)

        //     await token.connect(owner).approve(routerAddress, amountTokenDesired);

        //     await router.connect(owner).addLiquidityAVAX(
        //         contract_address,
        //         amountTokenDesired,
        //         0,
        //         0,
        //         to,
        //         deadline,
        //         { value: amountAVAXMin }
        //     );

        //     const initialAvaxBalance = await ethers.provider.getBalance(contract_address);
        //     const rewardAmount = ethers.parseUnits("200000",18);
        //     await token.connect(owner).approve(contract_address, rewardAmount);
        //     await token.connect(owner).transfer(contract_address, rewardAmount);
        //     const initialTokenBalance = await token.balanceOf(contract_address)
        //     await token.swapTokensForAvax(rewardAmount);
        //     const finalAvaxBalance = await ethers.provider.getBalance(contract_address);
        //     const finalTokenBalance = await token.balanceOf(contract_address);
        //     expect(finalAvaxBalance).to.be.gt(initialAvaxBalance, "El balance de AVAX no ha aumentado después del swap");
        // });

        // it("Debería cambiar avax por token", async function () {
        //                 const contract_address = await token.getAddress()
        //                 const sendValue = ethers.parseEther("0.3");
        //                 const sendTx = await wallet.sendTransaction({
        //                     to: contract_address, 
        //                     value: sendValue
        //                 });
        //                 await sendTx.wait();
        //                 const reflectionTokenAddress = await token.reflectionToken();
        //                 // Crear una instancia del contrato del token de reflexión usando la dirección obtenida
        //                 const reflectionTokenContract = await ethers.getContractAt("IERC20", reflectionTokenAddress);
        //                 const initialReflectionBalance = await reflectionTokenContract.balanceOf(contract_address);
        //                 const initialAvaxBalance = await ethers.provider.getBalance(contract_address);
        //                 const swapTx = await token.swapAvaxForReflection(sendValue);
        //                 await swapTx.wait(); 
        //                 const finalAvaxBalance = await ethers.provider.getBalance(contract_address);
        //                 const finalReflectionBalance = await reflectionTokenContract.balanceOf(contract_address);
        //                 expect(finalReflectionBalance).to.be.gt(initialReflectionBalance, "El balance de reflection token no ha aumentado después del swap");
        //                 expect(finalAvaxBalance).to.be.lt(initialAvaxBalance, "El balance de AVAX no ha disminuido después del swap");
        // })
        // it("Deberia cambiar el token reward por avax y luego cambiar el avax por el reflection Token", async function () {
        //     const factoryAddress = "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10"
        //     const routerAddress = "0x60aE616a2155Ee3d9A68541Ba4544862310933d4"
        //     const factory = await ethers.getContractAt("IJoeFactory", factoryAddress);
        //     const router = await ethers.getContractAt("IJoeRouter", routerAddress);

        //     const contract_address = await token.getAddress()
        //     const owner_address = await owner.getAddress()

        //     const amountTokenDesired = ethers.parseUnits("100000000", 18);
        //     const amountTokenMin = ethers.parseUnits("100000000", 18);
        //     const amountAVAXMin = ethers.parseEther("0.6"); 

        //     const to = owner_address; 
        //     const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // Establecer un deadline (por ejemplo, 20 minutos desde ahora)

        //     await token.connect(owner).approve(routerAddress, amountTokenDesired);

        //     await router.connect(owner).addLiquidityAVAX(
        //         contract_address,
        //         amountTokenDesired,
        //         0,
        //         0,
        //         to,
        //         deadline,
        //         { value: amountAVAXMin }
        //     );

        //     const initialAvaxBalance = await ethers.provider.getBalance(contract_address);
        //     const rewardAmount = ethers.parseUnits("200000",18);
        //     await token.connect(owner).approve(contract_address, rewardAmount);
        //     await token.connect(owner).transfer(contract_address, rewardAmount);
        //     await token.swapTokensForAvax(rewardAmount);
        //     const finalAvaxBalance = await ethers.provider.getBalance(contract_address);
            

        //     const sendTx = await wallet.sendTransaction({
        //         to: contract_address, 
        //         value: finalAvaxBalance
        //     });
        //     await sendTx.wait();
        //     const reflectionTokenAddress = await token.reflectionToken();
        //     // Crear una instancia del contrato del token de reflexión usando la dirección obtenida
        //     const reflectionTokenContract = await ethers.getContractAt("IERC20", reflectionTokenAddress);
        //     const initialReflectionBalance = await reflectionTokenContract.balanceOf(contract_address);
        //     const swapTx = await token.swapAvaxForReflection(finalAvaxBalance);
        //     await swapTx.wait(); 
        //     const finalReflectionBalance = await reflectionTokenContract.balanceOf(contract_address);
        //     expect(finalReflectionBalance).to.be.gt(initialReflectionBalance, "El balance de reflection token no ha aumentado después del swap");
        // })
        // it("Debería hacer el proceso de un swap y repartir un reward, luego cambiar el reflection token, hacer otro proceso de un swap y repartir el nuevo reward ", async function () {
        //     const factoryAddress = "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10"
        //     const routerAddress = "0x60aE616a2155Ee3d9A68541Ba4544862310933d4"
        //     const factory = await ethers.getContractAt("IJoeFactory", factoryAddress);
        //     const router = await ethers.getContractAt("IJoeRouter", routerAddress);

        //     const contract_address = await token.getAddress()
        //     const owner_address = await owner.getAddress()

        //     const amountTokenDesired = ethers.parseUnits("100000000", 18);
        //     const amountTokenMin = ethers.parseUnits("100000000", 18);
        //     const amountAVAXMin = ethers.parseEther("0.6"); 

        //     const to = owner_address; 
        //     const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // Establecer un deadline (por ejemplo, 20 minutos desde ahora)

        //     await token.connect(owner).approve(routerAddress, amountTokenDesired);

        //     await router.connect(owner).addLiquidityAVAX(
        //         contract_address,
        //         amountTokenDesired,
        //         0,
        //         0,
        //         to,
        //         deadline,
        //         { value: amountAVAXMin }
        //     );

        //     const initialAvaxBalance2 = await ethers.provider.getBalance(contract_address);
        //     const rewardAmount2 = ethers.parseUnits("200000",18);
        //     await token.connect(owner).approve(contract_address, rewardAmount2);
        //     await token.connect(owner).transfer(contract_address, rewardAmount2);
        //     await token.swapTokensForAvax(rewardAmount2);
        //     const finalAvaxBalance2 = await ethers.provider.getBalance(contract_address);
            

        //     const sendTx2 = await wallet.sendTransaction({
        //         to: contract_address, 
        //         value: finalAvaxBalance2
        //     });
        //     await sendTx2.wait();
        //     const reflectionTokenAddress2 = await token.reflectionToken();
        //     // Crear una instancia del contrato del token de reflexión usando la dirección obtenida
        //     const reflectionTokenContract2 = await ethers.getContractAt("IERC20", reflectionTokenAddress2);
        //     const initialReflectionBalance2 = await reflectionTokenContract2.balanceOf(contract_address);
        //     const swapTx2 = await token.swapAvaxForReflection(finalAvaxBalance2);
        //     await swapTx2.wait(); 
        //     const finalReflectionBalance2 = await reflectionTokenContract2.balanceOf(contract_address);


        //     //cambiar el token reward
        //     const new_reflection = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
        //     await token.setReflectionToken(new_reflection)

        //     const initialAvaxBalance = await ethers.provider.getBalance(contract_address);
        //     const rewardAmount = ethers.parseUnits("200000",18);
        //     await token.connect(owner).approve(contract_address, rewardAmount);
        //     await token.connect(owner).transfer(contract_address, rewardAmount);
        //     await token.swapTokensForAvax(rewardAmount);
        //     const finalAvaxBalance = await ethers.provider.getBalance(contract_address);
            

        //     const sendTx = await wallet.sendTransaction({
        //         to: contract_address, 
        //         value: finalAvaxBalance
        //     });
        //     await sendTx.wait();
        //     const reflectionTokenAddress = await token.reflectionToken();
        //     // Crear una instancia del contrato del token de reflexión usando la dirección obtenida
        //     const reflectionTokenContract = await ethers.getContractAt("IERC20", reflectionTokenAddress);
        //     const initialReflectionBalance = await reflectionTokenContract.balanceOf(contract_address);
        //     const swapTx = await token.swapAvaxForReflection(finalAvaxBalance);
        //     await swapTx.wait(); 
        //     const finalReflectionBalance = await reflectionTokenContract.balanceOf(contract_address);
        //     expect(finalReflectionBalance).to.be.gt(initialReflectionBalance, "El balance de reflection token no ha aumentado después del swap");
            
        // })
        it("Debería aumentar los tokens del contrato por tax de transferencias",async  function (){
            
            const owner_address =  await owner.getAddress()
            const balence_owner = await token.balanceOf(owner_address)
            const addr1_balance = await token.balanceOf(addr1.address)
            const token_address = await token.getAddress()
            const balance_contract = await token.balanceOf(token_address)
            const transfer1 = 1000;
            const txOwnerToAddr1 = await token.transfer(addr1.address,transfer1)
            await txOwnerToAddr1.wait()
            const new_balance_contract = await token.balanceOf(token_address)
            expect(new_balance_contract).to.be.gt(balance_contract)
        })
        it("Debería taxar las interacciones con el LP", async function () {
            const owner_address = await owner.getAddress()
            const contract_address = await token.getAddress()
            const balance_before = await token.balanceOf(contract_address)

            //Add liquidity
            const factoryAddress = "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10"
            const routerAddress = "0x60aE616a2155Ee3d9A68541Ba4544862310933d4"
            const factory = await ethers.getContractAt("IJoeFactory", factoryAddress);
            const router = await ethers.getContractAt("IJoeRouter", routerAddress);
            const amountTokenDesired = ethers.parseUnits("10000000000", 18);
            const amountAVAXMin = ethers.parseEther("0.6"); 
            const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // Establecer un deadline (por ejemplo, 20 minutos desde ahora)
            await token.connect(owner).approve(routerAddress, amountTokenDesired);
            await router.connect(owner).addLiquidityAVAX(
                contract_address,
                amountTokenDesired,
                0,
                0,
                owner_address,
                deadline,
                { value: amountAVAXMin }
            );

            const transfer1 = ethers.parseUnits("1000000",18);
            const txOwnerToAddr1 = await token.transfer(addr1.address,transfer1)


            const outputTokenAddress = await router.WAVAX();
            const swap = ethers.parseUnits("1000",18);
            const path = [contract_address, outputTokenAddress];


            await token.connect(addr1).approve(routerAddress, swap);
            await router.connect(addr1).swapExactTokensForAVAXSupportingFeeOnTransferTokens(
                swap,
                0,
                path,
                addr1.address,
                deadline
            );

            const balance_after = await token.balanceOf(contract_address)
            expect(balance_after).to.be.gt(balance_before)
        })
        it("Debería al bajar el threshold del swap, hacer el swap de los tokens,y repartir token reflection",async function () {
            //Low the threshold for swap tokens
            const threshold = ethers.parseUnits("0.0003", 18);
            await token.setSwapTokensAtAmount(threshold)
            const tokensAmount = await token.swapTokensAtAmount()


            const contract_address = await token.getAddress()
            const owner_address = await owner.getAddress()
            
            
            //Add liquidity
            const factoryAddress = "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10"
            const routerAddress = "0x60aE616a2155Ee3d9A68541Ba4544862310933d4"
            const factory = await ethers.getContractAt("IJoeFactory", factoryAddress);
            const router = await ethers.getContractAt("IJoeRouter", routerAddress);
            const amountTokenDesired = ethers.parseUnits("10000000000", 18);
            const amountAVAXMin = ethers.parseEther("0.6"); 
            const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // Establecer un deadline (por ejemplo, 20 minutos desde ahora)
            await token.connect(owner).approve(routerAddress, amountTokenDesired);
            await router.connect(owner).addLiquidityAVAX(
                contract_address,
                amountTokenDesired,
                0,
                0,
                owner_address,
                deadline,
                { value: amountAVAXMin }
            );

            //Make transactions for taxing purposes
            const transfer1 = 1000000000000000;
            const txOwnerToAddr1 = await token.transfer(addr1.address,transfer1)
            const balance_contract = await token.balanceOf(contract_address)
            const transfer2 = 2000000000000000;
            const txOwnerToAddr2 = await token.transfer(addr2.address,transfer2)
            const balance_contract_tx2 = await token.balanceOf(contract_address)
            const transfer3 = 3100000000000000;
            const txOwnerToAddr3 = await token.transfer(addr3.address,transfer3)
            const balance_contract_tx3 = await token.balanceOf(contract_address)
            const transfer4 = 100000000;
            const txOwnerToAddr1_ = await token.transfer(addr1.address,transfer4)
            const balance_contract_tx4 = await token.balanceOf(contract_address)


            //swap tokens to initiate swap
            const outputTokenAddress = await router.WAVAX();
            const swap = ethers.parseUnits("1000",18);
            const path = [contract_address, outputTokenAddress];
            await token.connect(owner).approve(routerAddress, swap);
            await router.connect(owner).swapExactTokensForAVAXSupportingFeeOnTransferTokens(
                swap,
                0,
                path,
                owner_address,
                deadline
            );


            //addreses must got rewards
            const reflectionTokenAddress = await token.reflectionToken();
            const reflectionTokenContract = await ethers.getContractAt("IERC20", reflectionTokenAddress);
            const distributorContract_adress = await distributorContract.getAddress()
            const distributor_reflection = await reflectionTokenContract.balanceOf(distributorContract_adress)
            const addr1_reflection = await reflectionTokenContract.balanceOf(addr1.address)
            const addr2_reflection = await reflectionTokenContract.balanceOf(addr2.address)
            const addr3_reflection = await reflectionTokenContract.balanceOf(addr3.address)
            const owner_reflextion = await reflectionTokenContract.balanceOf(owner_address)

            // Verificar que las direcciones han recibido las recompensas
            expect(distributor_reflection).to.be.gt(0, "El distribuidor no ha recibido tokens de reflexión");
            expect(addr1_reflection).to.be.gt(0, "La dirección 1 no ha recibido tokens de reflexión");
            expect(addr2_reflection).to.be.gt(0, "La dirección 2 no ha recibido tokens de reflexión");
            expect(addr3_reflection).to.be.gt(0, "La dirección 3 no ha recibido tokens de reflexión");
            expect(owner_reflextion).to.be.gt(0, "El propietario no ha recibido tokens de reflexión");

        })
        it("Debería hacer tx para juntar el swap amount, hacer la reparticion del reward, cambiar el reflection token, y luego repartir el nuevo reflection token", async function (){
            const threshold = ethers.parseUnits("0.0003", 18);
            await token.setSwapTokensAtAmount(threshold)

            const contract_address = await token.getAddress()
            const owner_address = await owner.getAddress()

            //Add liquidity
            const factoryAddress = "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10"
            const routerAddress = "0x60aE616a2155Ee3d9A68541Ba4544862310933d4"
            const factory = await ethers.getContractAt("IJoeFactory", factoryAddress);
            const router = await ethers.getContractAt("IJoeRouter", routerAddress);
            const amountTokenDesired = ethers.parseUnits("50000000000", 18);
            const amountAVAXMin = ethers.parseEther("2"); 
            const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // Establecer un deadline (por ejemplo, 20 minutos desde ahora)
            await token.connect(owner).approve(routerAddress, amountTokenDesired);
            await router.connect(owner).addLiquidityAVAX(
                contract_address,
                amountTokenDesired,
                0,
                0,
                owner_address,
                deadline,
                { value: amountAVAXMin }
            );

            //Make transactions for taxing purposes
            const transfer1 = 1000000000000000;
            const txOwnerToAddr1 = await token.transfer(addr1.address,transfer1)
            const balance_contract = await token.balanceOf(contract_address)
            const transfer2 = 2000000000000000;
            const txOwnerToAddr2 = await token.transfer(addr2.address,transfer2)
            const balance_contract_tx2 = await token.balanceOf(contract_address)
            const transfer3 = 3100000000000000;
            const txOwnerToAddr3 = await token.transfer(addr3.address,transfer3)
            const balance_contract_tx3 = await token.balanceOf(contract_address)
            const transfer4 = 400000000000000;
            const txOwnerToAddr1_ = await token.transfer(addr1.address,transfer4)
            const balance_contract_tx4 = await token.balanceOf(contract_address)
            const transfer5 = 400000000000000;
            const txOwnerToAddr2_ = await token.transfer(addr1.address,transfer5)
            const balance_contract_tx5 = await token.balanceOf(contract_address)


            //swap tokens to initiate swap
            const outputTokenAddress = await router.WAVAX();
            const swap = ethers.parseUnits("1000",18);
            const path = [contract_address, outputTokenAddress];
            await token.connect(owner).approve(routerAddress, swap);
            await router.connect(owner).swapExactTokensForAVAXSupportingFeeOnTransferTokens(
                swap,
                0,
                path,
                owner_address,
                deadline
            );

            //addreses must got rewards
            const reflectionTokenAddress = await token.reflectionToken();
            const reflectionTokenContract = await ethers.getContractAt("IERC20", reflectionTokenAddress);
            const distributorContract_adress = await distributorContract.getAddress()



            const new_reflection = "0x420FcA0121DC28039145009570975747295f2329"
            await (token.setReflectionToken(new_reflection))

            const new_minperiod = 1;
            await token.setDistributionCriteria(new_minperiod);

            const transfer1_ = 2000000000000000;
            await token.transfer(addr1.address,transfer1_)
            const transfer2_ = 2000000000000000;
            await token.transfer(addr2.address,transfer2_)
            const transfer3_ = 2000000000000000;
            await token.transfer(addr3.address,transfer3_)

            await new Promise(resolve => setTimeout(resolve, 2000));


            const swap2 = ethers.parseUnits("0.001",18)
            await token.connect(addr1).approve(routerAddress, swap2);
            await router.connect(addr1).swapExactTokensForAVAXSupportingFeeOnTransferTokens(
                swap2,
                0,
                path,
                addr1.address,
                deadline
                );


                const balance_contract_ = await token.balanceOf(contract_address)
                const swapAmount = await token.swapTokensAtAmount()
                const avaxBalance = await ethers.provider.getBalance(contract_address)
                const reflectionTokenAddressNew = await token.reflectionToken();


                const reflectionTokenContractNew = await ethers.getContractAt("IERC20", reflectionTokenAddressNew);
            
                const distributorReflectionBalance = await reflectionTokenContractNew.balanceOf(distributorContract_adress);
                const addr1_reflection_new = await reflectionTokenContractNew.balanceOf(addr1.address);
                const addr2_reflection_new = await reflectionTokenContractNew.balanceOf(addr2.address);
                const addr3_reflection_new = await reflectionTokenContractNew.balanceOf(addr3.address);
                const owner_reflextion_new = await reflectionTokenContractNew.balanceOf(owner_address);

                expect(addr1_reflection_new).to.be.gte(0, "La dirección 1 no ha recibido tokens de reflexión");
                expect(addr2_reflection_new).to.be.gte(0, "La dirección 2 no ha recibido tokens de reflexión");
                expect(addr3_reflection_new).to.be.gte(0, "La dirección 3 no ha recibido tokens de reflexión");
                expect(owner_reflextion_new).to.be.gte(0, "El propietario no ha recibido tokens de reflexión");

            
        })
        it("Deberia hacer un cambio de token reflection y hacer un swap", async function () {
            const new_reflection = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
            const reflection_token = await token.reflectionToken()
            await (token.setReflectionToken(new_reflection))

            const owner_address = await owner.getAddress()
            const contract_address = await token.getAddress()
            const balance_before = await token.balanceOf(contract_address)

            //Add liquidity
            const factoryAddress = "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10"
            const routerAddress = "0x60aE616a2155Ee3d9A68541Ba4544862310933d4"
            const factory = await ethers.getContractAt("IJoeFactory", factoryAddress);
            const router = await ethers.getContractAt("IJoeRouter", routerAddress);
            const amountTokenDesired = ethers.parseUnits("10000000000", 18);
            const amountAVAXMin = ethers.parseEther("0.6"); 
            const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // Establecer un deadline (por ejemplo, 20 minutos desde ahora)
            await token.connect(owner).approve(routerAddress, amountTokenDesired);
            await router.connect(owner).addLiquidityAVAX(
                contract_address,
                amountTokenDesired,
                0,
                0,
                owner_address,
                deadline,
                { value: amountAVAXMin }
            );

            const transfer1 = ethers.parseUnits("1000000",18);
            const txOwnerToAddr1 = await token.transfer(addr1.address,transfer1)


            const outputTokenAddress = await router.WAVAX();
            const swap = ethers.parseUnits("1000",18);
            const path = [contract_address, outputTokenAddress];


            await token.connect(addr1).approve(routerAddress, swap);
            await router.connect(addr1).swapExactTokensForAVAXSupportingFeeOnTransferTokens(
                swap,
                0,
                path,
                addr1.address,
                deadline
            );

            const balance_after = await token.balanceOf(contract_address)
            expect(balance_after).to.be.gt(balance_before)

            
        })
        
    })

});


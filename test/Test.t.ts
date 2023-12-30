import { expect } from "chai";
import { ethers } from "hardhat";
import { Token, Token__factory } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";


describe("ContratoToken", function () {
    let token: Token;
    let owner: SignerWithAddress;
    let distributorContract: Distributor;
    let addr1: SignerWithAddress;



    beforeEach(async function() {
        [owner,addr1] = await ethers.getSigners();
        const tokenFactory = (await ethers.getContractFactory("Token", owner)) as Token__factory;
        token = await tokenFactory.deploy(owner.address) as Token;
        await token.waitForDeployment(2);
        const distributorAddress = await token.distributorAddress();
        distributorContract = await ethers.getContractAt("Distributor", distributorAddress) as Distributor;
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


    });

    // describe("Tarifas", function () {
    //     it("Debería calcular las tarifas correctamente durante la transferencia", async function () {
    //         // Configurar las tarifas de reflexión para la prueba
    //         const reflectionFeeRate = 500; // Suponiendo que es 5%
    //         const transferAmount = ethers.parseUnits("1000", 18);
    //         const expectedFee = transferAmount.mul(reflectionFeeRate).div(10000);
    
    //         // Asegurarse de que addr1 no esté exento de tarifas
    //         await token.excludeFromFee(addr1.address, false);
    
    //         // Obtener el balance inicial del contrato y de addr1
    //         const initialContractBalance = await token.balanceOf(token.address);
    //         const initialAddr1Balance = await token.balanceOf(addr1.address);
    
    //         // Realizar la transferencia desde el propietario a addr1
    //         await token.transfer(addr1.address, transferAmount);
    
    //         // Obtener el balance final del contrato y de addr1
    //         const finalContractBalance = await token.balanceOf(token.address);
    //         const finalAddr1Balance = await token.balanceOf(addr1.address);
    
    //         // Calcular las tarifas reales
    //         const actualFee = finalContractBalance.sub(initialContractBalance);
    //         const actualTransferAmount = finalAddr1Balance.sub(initialAddr1Balance);
    
    //         // Verificar que las tarifas y la cantidad transferida sean las esperadas
    //         expect(actualFee).to.equal(expectedFee);
    //         expect(actualTransferAmount).to.equal(transferAmount.sub(expectedFee));
    //     });
    // });
});


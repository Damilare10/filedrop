const API_BASE = '';
const SERVER_WALLET = "0xaFcaDB5F93B80C32560b395570a65Eb13225aB87"; // Must match backend

// DOM Elements
const viewUpload = document.getElementById('uploadView');
const viewDownload = document.getElementById('downloadView');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('filePreview');
const previewName = document.getElementById('previewName');
const previewSize = document.getElementById('previewSize');
const removeFileBtn = document.getElementById('removeFile');
const priceInput = document.getElementById('priceInput');
const generateLinkBtn = document.getElementById('generateLinkBtn');
const resultArea = document.getElementById('resultArea');
const shareLinkInput = document.getElementById('shareLink');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const qrcodeDiv = document.getElementById('qrcode');
const walletStatus = document.getElementById('walletStatus');
const loader = document.getElementById('loader');
const payDownloadBtn = document.getElementById('payDownloadBtn');
const notification = document.getElementById('notification');

let selectedFile = null;
let userWallet = null;

// === init logic ===
init();

async function init() {
    setupEventListeners();

    // Check for ID param
    const urlParams = new URLSearchParams(window.location.search);
    const fileId = urlParams.get('id');

    if (fileId) {
        // Download Mode
        viewUpload.classList.remove('active');
        viewDownload.classList.add('active');
        await loadFileInfo(fileId);
    } else {
        // Upload Mode (Default)
    }

    // Auto-connect wallet if previously connected
    if (window.ethereum && window.ethereum.selectedAddress) {
        connectWallet();
    }
}

function setupEventListeners() {
    // Dropzone
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFileSelect(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));

    // Remove file
    removeFileBtn.addEventListener('click', () => {
        selectedFile = null;
        fileInput.value = '';
        filePreview.classList.add('hidden');
        dropZone.classList.remove('hidden');
        generateLinkBtn.disabled = true;
    });

    // Inputs
    priceInput.addEventListener('input', validateUploadForm);

    // Buttons
    generateLinkBtn.addEventListener('click', uploadFile);
    copyLinkBtn.addEventListener('click', () => {
        shareLinkInput.select();
        document.execCommand('copy');
        showNotification('Link copied!', 'success');
    });

    walletStatus.addEventListener('click', connectWallet);
    payDownloadBtn.addEventListener('click', handlePayAndDownload);
}

function handleFileSelect(file) {
    if (!file) return;
    selectedFile = file;

    previewName.textContent = file.name;
    previewSize.textContent = formatBytes(file.size);

    dropZone.classList.add('hidden');
    filePreview.classList.remove('hidden');
    validateUploadForm();
}

function validateUploadForm() {
    const hasFile = selectedFile !== null;
    const hasPrice = priceInput.value.length > 0 && parseFloat(priceInput.value) >= 0;
    generateLinkBtn.disabled = !(hasFile && hasPrice);
}

async function uploadFile() {
    if (!selectedFile) return;

    const price = priceInput.value;
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('price', price);

    toggleLoader(true, "Uploading...");

    try {
        const res = await fetch(`${API_BASE}/api/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await res.json();
        toggleLoader(false);

        if (res.ok) {
            showResult(data.link);
            showNotification('File uploaded successfully!', 'success');
        } else {
            showNotification(data.error || 'Upload failed', 'error');
        }
    } catch (e) {
        toggleLoader(false);
        showNotification('Network error', 'error');
    }
}

function showResult(link) {
    resultArea.classList.remove('hidden');
    shareLinkInput.value = link;

    // Generate QR
    qrcodeDiv.innerHTML = '';
    new QRCode(qrcodeDiv, {
        text: link,
        width: 128,
        height: 128
    });
}

// === Download Logic ===

let currentFileInfo = null;

async function loadFileInfo(fileId) {
    toggleLoader(true, "Loading file info...");
    try {
        const res = await fetch(`${API_BASE}/api/file/${fileId}/info`);
        const data = await res.json();

        toggleLoader(false);
        if (res.ok) {
            currentFileInfo = { ...data, id: fileId };
            document.getElementById('dlFilename').textContent = data.filename;
            document.getElementById('dlPrice').textContent = `${data.price_eth} ETH`;
            document.getElementById('dlSize').textContent = "Unknown"; // Backend doesn't send size yet

            // If free, change button text
            if (data.price_eth === 0) {
                payDownloadBtn.textContent = "Download (Free)";
            }
        } else {
            showNotification(data.error || "File not found", 'error');
            payDownloadBtn.disabled = true;
        }
    } catch {
        toggleLoader(false);
        showNotification("Failed to load file info", 'error');
    }
}

async function handlePayAndDownload() {
    if (!currentFileInfo) return;

    // If priced, require wallet
    if (currentFileInfo.price_eth > 0) {
        if (!userWallet) {
            try {
                await connectWallet();
            } catch {
                return;
            }
        }

        // Ensure network
        try {
            await switchNetwork();
        } catch (e) {
            showNotification(e.message, 'error');
            return;
        }

        // Payment Flow
        try {
            toggleLoader(true, "Processing Payment...");
            const txHash = await sendPayment(currentFileInfo.price_eth);

            await waitForTransaction(txHash);

            toggleLoader(true, "Downloading...");
            await downloadFile(currentFileInfo.id, txHash, userWallet);

            toggleLoader(false);
            showNotification("Download started!", 'success');

        } catch (e) {
            toggleLoader(false);
            showNotification(e.message, 'error');
        }
    } else {
        // Free download
        toggleLoader(true, "Downloading...");
        await downloadFile(currentFileInfo.id, "free", "anon");
        toggleLoader(false);
    }
}

async function downloadFile(fileId, txHash, payer) {
    const res = await fetch(`${API_BASE}/api/file/${fileId}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            payment_tx: txHash,
            payer: payer
        })
    });

    if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // filename suggestion from header not always accessible in CORS
        // usage of download attribute:
        a.download = currentFileInfo ? currentFileInfo.filename : 'download';
        document.body.appendChild(a);
        a.click();
        a.remove();
    } else {
        const json = await res.json();
        throw new Error(json.error || "Download failed");
    }
}

// === Web3 Helpers ===

async function connectWallet() {
    if (!window.ethereum) {
        showNotification("MetaMask not found", 'error');
        return;
    }

    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        userWallet = accounts[0];

        walletStatus.classList.add('connected');
        walletStatus.classList.remove('disconnected');
        walletStatus.querySelector('.status-text').textContent =
            `${userWallet.slice(0, 4)}...${userWallet.slice(-4)}`;

    } catch (e) {
        showNotification("Wallet connection denied", 'error');
    }
}

async function switchNetwork() {
    const BASE_SEPOLIA_ID = '0x14a34'; // 84532
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BASE_SEPOLIA_ID }],
        });
    } catch (switchError) {
        if (switchError.code === 4902) {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: BASE_SEPOLIA_ID,
                    chainName: 'Base Sepolia',
                    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                    rpcUrls: ['https://sepolia.base.org'],
                    blockExplorerUrls: ['https://sepolia.basescan.org/'],
                }],
            });
        } else {
            throw switchError;
        }
    }
}

async function sendPayment(amountEth) {
    const amountWei = BigInt(Math.round(amountEth * 1e18)).toString(16);

    const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
            from: userWallet,
            to: SERVER_WALLET,
            value: '0x' + amountWei
        }]
    });
    return txHash;
}

async function waitForTransaction(txHash) {
    // Basic polling
    let attempts = 0;
    while (attempts < 60) {
        const receipt = await window.ethereum.request({
            method: 'eth_getTransactionReceipt',
            params: [txHash]
        });
        if (receipt && receipt.status === '0x1') return true;
        if (receipt && receipt.status === '0x0') throw new Error("Transaction failed");

        await new Promise(r => setTimeout(r, 1000));
        attempts++;
    }
    throw new Error("Transaction timed out");
}

// === Utils ===

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function showNotification(msg, type) {
    const text = notification.querySelector('.notification-text');
    const icon = notification.querySelector('.notification-icon');

    text.textContent = msg;
    icon.textContent = type === 'success' ? '✅' : '❌';

    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 3000);
}

function toggleLoader(show, text) {
    if (show) {
        loader.classList.remove('hidden');
        if (text) loader.querySelector('.loader-text').textContent = text;
    } else {
        loader.classList.add('hidden');
    }
}

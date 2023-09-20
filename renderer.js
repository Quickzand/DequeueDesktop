
const ip = window.api.getLocalIP();
const uniqueCode = window.api.getUniqueCode();
const typeNumber = 4;
const errorCorrectionLevel = 'L';
const qr = qrcode(typeNumber, errorCorrectionLevel);
qr.addData(JSON.stringify({
    ip: ip,
    code: uniqueCode
}));
document.getElementById("code").innerHTML = uniqueCode;

qr.make();
document.getElementById('qrCanvas').innerHTML = qr.createImgTag();


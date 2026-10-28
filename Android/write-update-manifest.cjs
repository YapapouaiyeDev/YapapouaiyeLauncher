/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {version}=require('./version.json');
if(!/^\d+\.\d+\.\d+-A$/.test(version))throw new Error('Le manifeste public est réservé aux versions Android stables.');
const name=`Yapapouaiye-Android-${version}-arm64.apk`;
const apk=path.join(__dirname,'dist',name);const size=fs.statSync(apk).size;
if(size<1||size>600*1024*1024)throw new Error('Taille APK invalide.');
const digest='sha256:'+crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
const url=`https://github.com/YapapouaiyeDev/YapapouaiyeLauncher/releases/download/v${version}/${name}`;
const site=path.resolve(__dirname,'../site');
fs.writeFileSync(path.join(site,'android-updates.json'),JSON.stringify([{tag_name:'v'+version,draft:false,prerelease:false,assets:[{name,browser_download_url:url,size,digest}]}],null,2)+'\n');
const downloadsPath=path.join(site,'downloads.json');const downloads=JSON.parse(fs.readFileSync(downloadsPath,'utf8'));
downloads.android={version,url,prerelease:false};fs.writeFileSync(downloadsPath,JSON.stringify(downloads,null,2)+'\n');
console.log('Manifeste préparé pour '+version+'. Publier les fichiers GitHub avant de déployer le site.');

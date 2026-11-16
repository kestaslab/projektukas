const express=require('express');
const multer=require('multer');
const path=require('path');
const {getDb}=require('../db');
const {requireAdmin}=require('../middlewares/requireAdmin');
const {importLocalProgmis}=require('../services/localProgmis');
const router=express.Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,fieldSize:5*1024*1024,files:1}});
router.get('/admin/importas/progmis',requireAdmin,(req,res)=>{
  const row=getDb().prepare('SELECT report_json FROM local_import_reports ORDER BY id DESC LIMIT 1').get();
  res.render('admin/local_import',{title:'Vietinės mokymosi medžiagos importas',report:row?JSON.parse(row.report_json):null});
});
router.post('/admin/importas/progmis',requireAdmin,(req,res,next)=>{
  upload.single('bundle')(req,res,async error=>{
    if(error)return res.status(400).json({message:'Failas netinkamas arba viršija 5 MB.'});
    if(req.file&&!req.file.originalname.endsWith('.json'))return res.status(400).json({message:'Pasirinkite paruoštą JSON importo paketą.'});
    const text=req.file?req.file.buffer.toString('utf8'):req.body.bundle_text;
    if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>5*1024*1024)return res.status(400).json({message:'Pasirinkite arba įklijuokite importo paketą iki 5 MB.'});
    let bundle;try{bundle=JSON.parse(text);}catch{return res.status(400).json({message:'Failas nėra tinkamas JSON.'});}
    try{
      const db=getDb(),dataDir=process.env.DATA_DIR||path.join(__dirname,'..','..','data');
      const backup=path.join(dataDir,'before-local-import-'+Date.now()+'.sqlite');
      await db.backup(backup);
      return res.json({message:'Medžiaga importuota.',report:importLocalProgmis(bundle,db)});
    }catch(error){if(error.message.startsWith('Netink')||error.message.startsWith('Nerasta')||error.message.startsWith('Neatpažinta')||error.message.startsWith('Tuščias')||error.message.startsWith('Pakete')||error.message.startsWith('Užduoties'))return res.status(400).json({message:error.message});return next(error);}
  });
});
module.exports=router;

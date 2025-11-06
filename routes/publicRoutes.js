import {trackDrugByNFTId , trackingDrugsInfo , searchDrugByATCCode} from "../controllers/publicController.js"
import express from "express";


const router = express.Router();

router.get("/scanQR/:tokenId" , trackDrugByNFTId)

router.get("/Tracking/:identifier" , trackingDrugsInfo)

router.get("/drugs/search", searchDrugByATCCode);

export default router;
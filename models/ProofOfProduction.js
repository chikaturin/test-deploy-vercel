import mongoose from "mongoose";

const ProofOfProductionSchema = new mongoose.Schema(
  {
    manufacturer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PharmaCompany",
      required: true,
    },
    drug: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DrugInfo",
      required: true,
    },
    mfgDate: {
      type: Date,
      required: false,
    },
    expDate: {
      type: Date,
      required: false,
    },
    quantity: {
      type: Number,
      required: false,
    },
    batchNumber: {
      type: String,
      required: false,
      index: true,
    },
    qaInspector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    qaReportUri: {
      type: String,
      required: false,
    },
    chainTxHash: {
      type: String,
      required: false,
    },
    remainFrom: {
      type: Number,
      required: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("ProofOfProduction", ProofOfProductionSchema);


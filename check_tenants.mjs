import mongoose from "mongoose";
const uri = process.env.MURI;
await mongoose.connect(uri);
const cols = ["targetMaster","primarySales","secondarySales","claimsMaster","imsMaster","regionZoneMaster"];
for (const c of cols) {
  const coll = mongoose.connection.collection(c);
  const count = await coll.countDocuments();
  const tenants = await coll.distinct("tenantSlug");
  console.log(c, "count=", count, "tenants=", tenants);
}
await mongoose.disconnect();

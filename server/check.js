require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const { adminAuth } = require("./firebaseAdmin");
const Transaction = require("./models/Transaction");

async function check() {
    const MONGODB_URI = process.env.MONGODB_URI;
    await mongoose.connect(MONGODB_URI);

    const result = {
        users: [],
        uids: []
    };

    try {
        const listUsersResult = await adminAuth.listUsers(100);
        listUsersResult.users.forEach((userRecord) => {
            result.users.push({ email: userRecord.email, uid: userRecord.uid });
        });

        const distinctUIDs = await Transaction.distinct("uid");
        for (const uid of distinctUIDs) {
            const count = await Transaction.countDocuments({ uid });
            result.uids.push({ uid, count });
        }
    } catch (e) {
        result.error = e.message;
    }

    fs.writeFileSync("output.json", JSON.stringify(result, null, 2));

    await mongoose.connection.close();
}

check().catch(e => {
    fs.writeFileSync("output.json", JSON.stringify({ error: e.message }));
    process.exit(1);
});

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) {
        console.error("User list error:", userError.message);
    } else {
        console.log("Supabase Users:");
        users.users.forEach(u => console.log(`- ${u.email}: ${u.id}`));
    }

    const { data: tx, error: txError } = await supabase.from('transactions').select('id, user_id, amount');
    if (txError) {
        console.error("Transactions error:", txError.message);
    } else {
        console.log(`\nTotal transactions in Supabase: ${tx.length}`);
        const uids = [...new Set(tx.map(t => t.user_id))];
        uids.forEach(uid => {
            const count = tx.filter(t => t.user_id === uid).length;
            console.log(`- UID ${uid} has ${count} transactions.`);
        });
    }
}

check().catch(console.error);

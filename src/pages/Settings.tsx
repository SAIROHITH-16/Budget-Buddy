import { Layout } from "@/components/Layout";
import { ProfileSettings } from "@/components/ProfileSettings";
import { BudgetSettings } from "@/components/BudgetSettings";
import { CurrencySettings } from "@/components/CurrencySettings";
import { CurrencySetupDialog } from "@/components/CurrencySetupDialog";
import { Settings as SettingsIcon } from "lucide-react";

const Settings = () => {
  return (
    <Layout>
      <CurrencySetupDialog />
      <div className="space-y-6 max-w-lg">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-primary" />
            Settings
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account preferences and budget limits.
          </p>
        </div>

        <ProfileSettings />
        <CurrencySettings />
        <BudgetSettings />
      </div>
    </Layout>
  );
};

export default Settings;

import { useState, useEffect } from "react";
import { DollarSign, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
  { code: "KRW", symbol: "₩", name: "South Korean Won" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar" },
  { code: "MXN", symbol: "Mex$", name: "Mexican Peso" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "RUB", symbol: "₽", name: "Russian Ruble" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
];

export function CurrencySetupDialog() {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState<string>("USD");

  useEffect(() => {
    // Check if user has already set currency
    const savedCurrency = localStorage.getItem("preferredCurrency");
    const setupComplete = localStorage.getItem("currencySetupComplete");
    
    // Show dialog only if currency hasn't been set up
    if (!savedCurrency && !setupComplete) {
      setOpen(true);
    }
  }, []);

  const handleSave = () => {
    // Save currency preference
    localStorage.setItem("preferredCurrency", currency);
    localStorage.setItem("currencySetupComplete", "true");
    
    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent("currencyChange", { detail: currency }));
    
    setOpen(false);
  };

  const selectedCurrency = CURRENCIES.find(c => c.code === currency);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <DollarSign className="h-6 w-6 text-primary" />
            Welcome! Choose Your Currency
          </DialogTitle>
          <DialogDescription className="text-base pt-2">
            Select your preferred currency for displaying amounts throughout the app. 
            You can change this later in Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="currency-select">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="currency-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {CURRENCIES.map((curr) => (
                  <SelectItem key={curr.code} value={curr.code}>
                    {curr.symbol} - {curr.name} ({curr.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCurrency && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Preview:</p>
              <p>All amounts will be displayed as <span className="font-semibold text-foreground">{selectedCurrency.symbol}1,234.56</span></p>
            </div>
          )}
        </div>

        <Button onClick={handleSave} className="w-full" size="lg">
          <Check className="h-5 w-5 mr-2" />
          Continue with {selectedCurrency?.code}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

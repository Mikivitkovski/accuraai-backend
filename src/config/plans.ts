export const DEFAULT_PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    currency: "USD",
    interval: "month",
    features: { document_limit: 1, document_limit_period: "lifetime" },
  },
  {
    id: "basic",
    name: "Basic",
    price: 29,
    currency: "USD",
    
    interval: "month",
    features: { document_limit: 3, document_limit_period: "lifetime" },
  },
  {
    id: "pro",
    name: "Pro",
    price: 79,
    currency: "USD",
    interval: "month",
    features: { document_limit: 5, document_limit_period: "monthly" },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 100,
    currency: "USD",
    interval: "month",
    features: { document_limit: null, document_limit_period: "lifetime" },
  },
] as const;
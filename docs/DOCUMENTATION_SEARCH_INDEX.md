# Steps C & D: Documentation Search Index

## Quick Lookup by Topic

### Finance & Money
- **VAT Calculation**: [FINANCE_SIMULATION.md](FINANCE_SIMULATION.md)
- **Margin Calculation**: [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#money-math-quick-reference) | [FINANCE_SIMULATION.md](FINANCE_SIMULATION.md)
- **Break-Even Logic**: [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#money-math-quick-reference) | [FINANCE_SIMULATION.md](FINANCE_SIMULATION.md)
- **Profit Calculation**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#post-apifinancesimulate)
- **Money Helpers**: [FINANCE_SIMULATION.md](FINANCE_SIMULATION.md)
- **Currency Formatting**: [DASHBOARD_UI_STEP_D.md](DASHBOARD_UI_STEP_D.md#formatting-helpers)

---

### API Routes & Implementation
- **All 9 Routes Overview**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md) | [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#api-routes-at-a-glance)
- **Finance Simulation Route**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#post-apifinancesimulate)
- **Decision Engine Route**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#post-apidecisionevaluate)
- **Launch Plan Routes**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#launch-plan-api)
- **Payouts Routes**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#payouts-api)
- **Admin Payouts Routes**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#admin-payouts-api)
- **KPI Route**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#get-apimarketplacekpis)
- **Scenarios Route**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#getpost-apifinancesscenarios)
- **Request/Response Schemas**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md) - See "Request Schema" sections
- **Error Codes**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#error-handling) | [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#error-handling)

---

### Dashboard Components
- **SimulatorClient**: [DASHBOARD_UI_STEP_D.md](DASHBOARD_UI_STEP_D.md#1-finance-simulator-dashboardshopfinance)
- **LaunchPlanClient**: [DASHBOARD_UI_STEP_D.md](DASHBOARD_UI_STEP_D.md#2-launch-plan-generator-dashboardshoplaunch)
- **PayoutsClient**: [DASHBOARD_UI_STEP_D.md](DASHBOARD_UI_STEP_D.md#3-payouts-manager-dashboardshoppayouts)
- **GrowthKPIsClient**: [DASHBOARD_UI_STEP_D.md](DASHBOARD_UI_STEP_D.md#4-growth-kpis-dashboard-dashboardmarketplacegrowth)
- **Component Patterns**: [DASHBOARD_UI_STEP_D.md](DASHBOARD_UI_STEP_D.md#component-architecture)
- **Testing Components**: [DASHBOARD_UI_STEP_D.md](DASHBOARD_UI_STEP_D.md#testing-checklist)
- **Accessibility**: [DASHBOARD_UI_STEP_D.md](DASHBOARD_UI_STEP_D.md#accessibility--ux)

---

### Decision Engine & Business Logic
- **Profit Guardrails**: [DECISION_ENGINE.md](DECISION_ENGINE.md#profit-guardrails)
- **Rejection Rules**: [DECISION_ENGINE.md](DECISION_ENGINE.md#rejection-rules) | [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#decision-engine-rules)
- **Warning Flags**: [DECISION_ENGINE.md](DECISION_ENGINE.md#warning-flags-non-blocking)
- **Thresholds by Product Type**: [DECISION_ENGINE.md](DECISION_ENGINE.md#api-endpoint) | [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#decision-engine-rules)
- **Price Recommendation Algorithm**: [DECISION_ENGINE.md](DECISION_ENGINE.md#price-recommendation-algorithm) | [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#decision-engine-rules)
- **Integration Guide**: [DECISION_ENGINE.md](DECISION_ENGINE.md#integration-with-product-publishing)
- **Test Cases**: [DECISION_ENGINE.md](DECISION_ENGINE.md#unit-tests)

---

### Testing & QA
- **All Testing Procedures**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#local-testing)
- **TypeScript Compilation**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#1-typescript-compilation)
- **Unit Tests**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#2-unit-tests) | Run: `npm test -- __tests__/finance __tests__/decision-engine`
- **Build Verification**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#3-build)
- **Development Server**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#4-local-development-server)
- **Manual UI Testing**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#5-manual-ui-testing)
- **Integration Testing**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#integration-testing-curlpostman)
- **Test Coverage Report**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#unit-tests)

---

### Deployment & DevOps
- **Pre-Deployment Checklist**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#pre-deployment-checklist)
- **Staging Deployment**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#staging-deployment)
- **Production Deployment**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#production-deployment)
- **Monitoring & Alerts**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#monitoring--alerts)
- **Rollback Procedures**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#rollback-plan)
- **Troubleshooting**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#troubleshooting)
- **Performance Optimization**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#performance-optimization)

---

### Security & Authorization
- **Authentication Pattern**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#server-side-auth-pattern)
- **Admin Role Checks**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#role-checks) | [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#admin-authorization-flow)
- **Store Ownership Verification**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#store-ownership-verification)
- **RLS Enforcement**: [STEP_CD_IMPLEMENTATION_SUMMARY.md](STEP_CD_IMPLEMENTATION_SUMMARY.md#security--compliance)
- **Zod Validation**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#error-handling) | [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#zod-validation-examples)
- **Security Review Checklist**: [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#pre-deployment-checklist)

---

### User Workflows
- **Merchant: Simulate Profit**: [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#merchant-is-this-product-profitable)
- **Merchant: Evaluate Product**: [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#merchant-should-i-launch-this-product)
- **Merchant: Launch Plan**: [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#merchant-how-do-i-launch-successfully)
- **Merchant: Request Payout**: [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#merchant-i-want-to-withdraw-500)
- **Merchant: View KPIs**: [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#merchant-how-is-my-store-performing)
- **Admin: Approve Payout**: [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#admin-approve-this-payout-request)

---

### Architecture & Design
- **System Architecture Diagram**: [ARCHITECTURE_VISUAL_REFERENCE.md](ARCHITECTURE_VISUAL_REFERENCE.md#system-architecture-diagram)
- **Finance Simulation Flow**: [ARCHITECTURE_VISUAL_REFERENCE.md](ARCHITECTURE_VISUAL_REFERENCE.md#data-flow-finance-simulation)
- **Product Evaluation Flow**: [ARCHITECTURE_VISUAL_REFERENCE.md](ARCHITECTURE_VISUAL_REFERENCE.md#data-flow-product-evaluation)
- **Payout Management Flow**: [ARCHITECTURE_VISUAL_REFERENCE.md](ARCHITECTURE_VISUAL_REFERENCE.md#data-flow-payout-management)
- **KPI Retrieval Flow**: [ARCHITECTURE_VISUAL_REFERENCE.md](ARCHITECTURE_VISUAL_REFERENCE.md#data-flow-kpi-retrieval)
- **Authentication Flow**: [ARCHITECTURE_VISUAL_REFERENCE.md](ARCHITECTURE_VISUAL_REFERENCE.md#authentication--authorization-flow)
- **Admin Authorization Flow**: [ARCHITECTURE_VISUAL_REFERENCE.md](ARCHITECTURE_VISUAL_REFERENCE.md#admin-authorization-flow)
- **Error Handling Flow**: [ARCHITECTURE_VISUAL_REFERENCE.md](ARCHITECTURE_VISUAL_REFERENCE.md#error-handling-flow)
- **Database Schema**: [ARCHITECTURE_VISUAL_REFERENCE.md](ARCHITECTURE_VISUAL_REFERENCE.md#database-schema-relationships) | [STEP_CD_IMPLEMENTATION_SUMMARY.md](STEP_CD_IMPLEMENTATION_SUMMARY.md#database-policies-rls)
- **Component State Management**: [ARCHITECTURE_VISUAL_REFERENCE.md](ARCHITECTURE_VISUAL_REFERENCE.md#component-state-management)
- **Testing Pyramid**: [ARCHITECTURE_VISUAL_REFERENCE.md](ARCHITECTURE_VISUAL_REFERENCE.md#testing-pyramid)

---

### Zod Validation
- **Validation Pattern**: [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#zod-validation-examples)
- **Finance Simulate Schema**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#request-schema) & [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#zod-validation-examples)
- **Decision Evaluate Schema**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#request-schema) & [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#zod-validation-examples)
- **All Schemas**: [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md) - See "Request Schema" sections for each route

---

### Money & Financial Math
- **Core Concepts**: [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#core-concepts-30-seconds)
- **Money Model**: [STEP_CD_IMPLEMENTATION_SUMMARY.md](STEP_CD_IMPLEMENTATION_SUMMARY.md#money-model-integer-cents-only)
- **VAT Formula**: [FINANCE_SIMULATION.md](FINANCE_SIMULATION.md) | [STEP_CD_IMPLEMENTATION_SUMMARY.md](STEP_CD_IMPLEMENTATION_SUMMARY.md#money-model-integer-cents-only)
- **Margin Formula**: [STEP_CD_IMPLEMENTATION_SUMMARY.md](STEP_CD_IMPLEMENTATION_SUMMARY.md#money-model-integer-cents-only)
- **Break-Even Formula**: [FINANCE_SIMULATION.md](FINANCE_SIMULATION.md)
- **Money Math Examples**: [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#money-math-quick-reference)

---

### Files & File Locations
- **New Files (23 total)**: [STEP_CD_IMPLEMENTATION_SUMMARY.md](STEP_CD_IMPLEMENTATION_SUMMARY.md#file-inventory) | [MASTER_INDEX_STEP_CD.md](MASTER_INDEX_STEP_CD.md#file-locations)
- **Modified Files (12 total)**: [STEP_CD_IMPLEMENTATION_SUMMARY.md](STEP_CD_IMPLEMENTATION_SUMMARY.md#file-inventory) | [MASTER_INDEX_STEP_CD.md](MASTER_INDEX_STEP_CD.md#file-locations)
- **Decision Engine Path**: `/lib/decision-engine/`
- **API Routes Path**: `/app/api/`
- **Dashboard Components Path**: `/app/dashboard/`
- **Documentation Path**: `/docs/`

---

### Common Questions
- **"Is this product profitable?"**: See [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#merchant-is-this-product-profitable)
- **"What's the profit threshold?"**: See [DECISION_ENGINE.md](DECISION_ENGINE.md#profit-guardrails)
- **"How do I deploy?"**: See [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#production-deployment)
- **"How does VAT work?"**: See [FINANCE_SIMULATION.md](FINANCE_SIMULATION.md)
- **"What are error codes?"**: See [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#error-handling)
- **"How do I test?"**: See [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#local-testing)
- **"How do admins approve payouts?"**: See [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md#admin-approve-this-payout-request)
- **"What's the KPI dashboard showing?"**: See [DASHBOARD_UI_STEP_D.md](DASHBOARD_UI_STEP_D.md#4-growth-kpis-dashboard-dashboardmarketplacegrowth)

---

### Learning Paths by Role
- **Product Manager**: [MASTER_INDEX_STEP_CD.md](MASTER_INDEX_STEP_CD.md#for-product-managers)
- **Backend Developer**: [MASTER_INDEX_STEP_CD.md](MASTER_INDEX_STEP_CD.md#for-backend-developers)
- **Frontend Developer**: [MASTER_INDEX_STEP_CD.md](MASTER_INDEX_STEP_CD.md#for-frontend-developers)
- **QA/Tester**: [MASTER_INDEX_STEP_CD.md](MASTER_INDEX_STEP_CD.md#for-qatesting)
- **DevOps/Deployment**: [MASTER_INDEX_STEP_CD.md](MASTER_INDEX_STEP_CD.md#for-devopsdeployment)

---

### Quick Navigation
- **Start Here**: [FINAL_DELIVERY_STEPS_CD.md](FINAL_DELIVERY_STEPS_CD.md)
- **Complete Index**: [MASTER_INDEX_STEP_CD.md](MASTER_INDEX_STEP_CD.md)
- **One-Pager**: [QUICK_REFERENCE_STEP_CD.md](QUICK_REFERENCE_STEP_CD.md)
- **Visual Diagrams**: [ARCHITECTURE_VISUAL_REFERENCE.md](ARCHITECTURE_VISUAL_REFERENCE.md)
- **This Index**: [DOCUMENTATION_SEARCH_INDEX.md](DOCUMENTATION_SEARCH_INDEX.md) (you are here)

---

## Search by Commands

| Command | Purpose | Doc |
|---------|---------|-----|
| `npm run typecheck` | Verify types compile | [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#1-typescript-compilation) |
| `npm test` | Run unit tests | [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#2-unit-tests) |
| `npm run build` | Production build | [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#3-build) |
| `npm run dev` | Development server | [DEPLOYMENT_AND_TESTING_STEP_CD.md](DEPLOYMENT_AND_TESTING_STEP_CD.md#4-local-development-server) |
| `curl -X POST /api/finance/simulate` | Test API | [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#using-curl) |

---

## Search by Term

| Term | Relevant Docs |
|------|---|
| Authentication | [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#authentication--authorization) |
| Authorization | [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#authentication--authorization) |
| RLS (Row-Level Security) | [STEP_CD_IMPLEMENTATION_SUMMARY.md](STEP_CD_IMPLEMENTATION_SUMMARY.md#security--compliance) |
| Zod validation | [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md) |
| Component state | [DASHBOARD_UI_STEP_D.md](DASHBOARD_UI_STEP_D.md) |
| Mobile responsive | [DASHBOARD_UI_STEP_D.md](DASHBOARD_UI_STEP_D.md#accessibility--ux) |
| Error handling | [API_ROUTES_STEP_C.md](API_ROUTES_STEP_C.md#error-handling) |
| Database schema | [ARCHITECTURE_VISUAL_REFERENCE.md](ARCHITECTURE_VISUAL_REFERENCE.md#database-schema-relationships) |
| Performance | [STEP_CD_IMPLEMENTATION_SUMMARY.md](STEP_CD_IMPLEMENTATION_SUMMARY.md#performance-characteristics) |

---

**Last Updated**: February 12, 2025  
**Status**: Complete ✅


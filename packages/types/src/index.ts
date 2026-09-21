export * from "./zivira-tree";

export type PortalKind = "SUPER_ADMIN" | "COMPANY_ADMIN" | "FIELD_FORCE";

export type TenantStatus = "SETUP" | "SANDBOX" | "PILOT" | "LIVE" | "SUSPENDED";

export type SubscriptionPlan = "SANDBOX" | "GROWTH" | "ENTERPRISE";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  subscriptionPlan: SubscriptionPlan;
  licenseLimit: number;
  activeUsers: number;
  enabledModuleKeys: string[];
  storageUsedMb: number;
  createdAt: string;
  updatedAt: string;
};

export type PlatformModule = {
  id: string;
  key: string;
  name: string;
  description: string;
  category: "CORE" | "FIELD" | "AI" | "REPORTING" | "ADMIN" | "COMPLIANCE";
  defaultEnabled: boolean;
  featureKeys: string[];
  createdAt: string;
  updatedAt: string;
};

export type FeatureFlag = {
  id: string;
  key: string;
  name: string;
  description: string;
  enabledGlobally: boolean;
  enabledTenantSlugs: string[];
  rolloutStage: "INTERNAL" | "BETA" | "GA" | "PAUSED";
  createdAt: string;
  updatedAt: string;
};

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "NBH" | "ABM" | "MR";
  tenantSlug?: string;
  portal: PortalKind;
};

export type Employee = {
  id: string;
  tenantSlug: string;
  name: string;
  employeeCode: string;
  designation: string;
  division: string;
  reportingManager?: string;
  territory: string;
  role: "NBH" | "BH" | "RBM" | "ZBM" | "ABM" | "SR_MR" | "MR";
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

export type Doctor = {
  id: string;
  tenantSlug: string;
  name: string;
  specialty: string;
  category: "A" | "B" | "C";
  state: string;
  city: string;
  territory: string;
  mappedEmployeeCode?: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  tenantSlug: string;
  name: string;
  code: string;
  category: string;
  division: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

export type Dcr = {
  id: string;
  tenantSlug: string;
  employeeCode: string;
  doctorId?: string;
  visitDate: string;
  productsDetailed: string[];
  notes?: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
};

export type Attendance = {
  id: string;
  tenantSlug: string;
  employeeCode: string;
  attendanceDate: string;
  status: "PRESENT" | "ABSENT" | "LEAVE";
  checkInAt?: string;
  checkOutAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CompanyDashboard = {
  metrics: {
    employeeCount: number;
    doctorCount: number;
    activeProductCount: number;
    dcrSubmittedToday: number;
    attendanceMarkedToday: number;
  };
  recentDoctors: Doctor[];
  recentEmployees: Employee[];
};

export type FieldDashboard = {
  profile: Employee;
  today: {
    plannedVisits: number;
    completedDcrs: number;
    attendanceMarked: boolean;
  };
  doctors: Doctor[];
  recentDcrs: Dcr[];
};

export type ApiEnvelope<T> = {
  data: T;
};

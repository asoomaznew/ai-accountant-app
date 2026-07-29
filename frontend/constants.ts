import { CloverBankInfo, VendorOffsetAccounts } from './types';

export const CLOVER_BANK_INFO: CloverBankInfo[] = [
    // AL ASEEL INTERNATIONAL POLYCLINIC
    { accountName: "AL ASEEL INTERNATIONAL POLYCLINIC", oldAccountNo: "011010232380", accountNo: "KIBAA-2380", activities: "1194", propertyId: "CLO3", country: "01", departments: "113", projectId: "104" },
    { accountName: "AL ASEEL INTERNATIONAL POLYCLINIC", accountNo: "KIBAA-2398", activities: "1194", propertyId: "CLO3", country: "01", departments: "113", projectId: "104" },
    { accountName: "AL ASEEL INTERNATIONAL POLYCLINIC", accountNo: "KIBAA-2401", activities: "1194", propertyId: "CLO3", country: "01", departments: "113", projectId: "104" },
    
    // IRIS POLYCLINIC
    { accountName: "IRIS POLYCLINIC", oldAccountNo: "011010232282", accountNo: "KIBIR-2282", activities: "1193", propertyId: "CLO3", country: "01", departments: "113", projectId: "104" },
    { accountName: "IRIS POLYCLINIC", oldAccountNo: "011010232304", accountNo: "KIBIR-2304", activities: "1193", propertyId: "CLO3", country: "01", departments: "113", projectId: "104" },
    { accountName: "IRIS POLYCLINIC", oldAccountNo: "011010198645", accountNo: "KIBIR-8645", activities: "1193", propertyId: "CLO3", country: "01", departments: "113", projectId: "104" },

    // YARROW POLYCLINIC
    { accountName: "YARROW POLYCLINIC", oldAccountNo: "011010234765", accountNo: "KIBYR-4765", activities: "1198", propertyId: "CLO3", country: "01", departments: "113", projectId: "104" },
    { accountName: "YARROW POLYCLINIC", oldAccountNo: "011010234773", accountNo: "KIBYR-4773", activities: "1198", propertyId: "CLO3", country: "01", departments: "113", projectId: "104" },
    
    // MEWL POLYCLINIC
    { accountName: "MEWL POLYCLINIC", oldAccountNo: "011010236601", accountNo: "KIBML-6601", activities: "1205", propertyId: "CLO4", country: "01", departments: "113", projectId: "104" },
    { accountName: "MEWL POLYCLINIC", oldAccountNo: "011010236610", accountNo: "KIBML-6610", activities: "1205", propertyId: "CLO4", country: "01", departments: "113", projectId: "104" },
    
    // FOURTH MEDICAL CENTER
    { accountName: "FOURTH MEDICAL CENTER", oldAccountNo: "011010198602", accountNo: "KIBFR-8602", activities: "1195", propertyId: "CLO5", country: "01", departments: "113", projectId: "104" },
    { accountName: "FOURTH MEDICAL CENTER", oldAccountNo: "011010232770", accountNo: "KIBFR-2770", activities: "1195", propertyId: "CLO5", country: "01", departments: "113", projectId: "104" },
    { accountName: "FOURTH MEDICAL CENTER", oldAccountNo: "011010232789", accountNo: "KIBFR-2789", activities: "1195", propertyId: "CLO5", country: "01", departments: "113", projectId: "104" },
    
    // JOYA POLYCLINIC
    { accountName: "JOYA POLYCLINIC", oldAccountNo: "011010232258", accountNo: "KIBJY-2258", activities: "1197", propertyId: "CLO6", country: "01", departments: "113", projectId: "104" },
    { accountName: "JOYA POLYCLINIC", oldAccountNo: "011010232266", accountNo: "KIBJY-2266", activities: "1197", propertyId: "CLO6", country: "01", departments: "113", projectId: "104" },
    
    // MEDICAL HARBOUR CENTER
    { accountName: "MEDICAL HARBOUR CENTER", oldAccountNo: "011010232231", accountNo: "KIBMH-2231", activities: "1196", propertyId: "CLO6", country: "01", departments: "113", projectId: "104" },
    { accountName: "MEDICAL HARBOUR CENTER", oldAccountNo: "011010232240", accountNo: "KIBMH-2240", activities: "1196", propertyId: "CLO6", country: "01", departments: "113", projectId: "104" },
    
    // MED MARINE POLYCLINIC
    { accountName: "MED MARINE POLYCLINIC", oldAccountNo: "011010232207", accountNo: "KIBMM-2207", activities: "1191", propertyId: "CLO6", country: "01", departments: "113", projectId: "104" },
    { accountName: "MED MARINE POLYCLINIC", accountNo: "KIBMM-2215", activities: "1191", propertyId: "CLO6", country: "01", departments: "113", projectId: "104" },
    { accountName: "MED MARINE POLYCLINIC", accountNo: "KIBMM-2223", activities: "1191", propertyId: "CLO6", country: "01", departments: "113", projectId: "104" },
    { accountName: "Med Marine Medical Polyclinic", oldAccountNo: "012090001648", accountNo: "KIBMM-1648", activities: "1191", propertyId: "CLO6", country: "01", departments: "113", projectId: "104" },
    { accountName: "Med Marine Medical Polyclinic", oldAccountNo: "012090001656", accountNo: "KIBMM-1656", activities: "1191", propertyId: "CLO6", country: "01", departments: "113", projectId: "104" },

    // MED GRAY POLYCLINIC
    { accountName: "MED GRAY POLYCLINIC", oldAccountNo: "011010232320", accountNo: "KIBMG-2320", activities: "1192", propertyId: "CLO7", country: "01", departments: "113", projectId: "104" },
    { accountName: "MED GRAY POLYCLINIC", accountNo: "KIBMG-2339", activities: "1192", propertyId: "CLO7", country: "01", departments: "113", projectId: "104" },
    { accountName: "MED GRAY POLYCLINIC", accountNo: "KIBMG-2347", activities: "1192", propertyId: "CLO7", country: "01", departments: "113", projectId: "104" },
    { accountName: "MED GRAY POLYCLINIC", oldAccountNo: "012090001630", accountNo: "KIBMG-1630", activities: "1192", propertyId: "CLO7", country: "01", departments: "113", projectId: "104" },
    
    // ARAM MEDICAL POLYCLINIC
    { accountName: "ARAM MEDICAL POLYCLINIC", accountNo: "KIBAM-2290", activities: "1199", propertyId: "CLO8", country: "01", departments: "113", projectId: "104" },
    { accountName: "ARAM MEDICAL POLYCLINIC", oldAccountNo: "011010223577", accountNo: "KIBAM-3577", activities: "1199", propertyId: "CLO8", country: "01", departments: "113", projectId: "104" },
    { accountName: "ARAM MEDICAL POLYCLINIC", oldAccountNo: "012090001680", accountNo: "KIBAM-1680", activities: "1199", propertyId: "CLO8", country: "01", departments: "113", projectId: "104" },
    
    // TRI CARE CLINIC
    { accountName: "TRI CARE CLINIC", oldAccountNo: "011010245252", accountNo: "KIBTR-5252", activities: "1211", propertyId: "CLO8", country: "01", departments: "113", projectId: "104" },
    { accountName: "TRI CARE CLINIC", oldAccountNo: "012090003810", accountNo: "KIBTR-3810", activities: "1211", propertyId: "CLO8", country: "01", departments: "113", projectId: "104" },
];

export const VENDOR_OFFSET_ACCOUNTS: VendorOffsetAccounts = {
    "AL ASEEL INTERNATIONAL POLYCLINIC": "50-000010",
    "IRIS POLYCLINIC": "50-000004",
    "YARROW POLYCLINIC": "50-000005",
    "MEWL POLYCLINIC": "50-000011",
    "FOURTH MEDICAL CENTER": "50-000009",
    "JOYA POLYCLINIC": "50-000002",
    "MEDICAL HARBOUR CENTER": "50-000008",
    "MED MARINE POLYCLINIC": "50-000006",
    "Med Marine Medical Polyclinic": "50-000006",
    "MED GRAY POLYCLINIC": "50-000003",
    "ARAM MEDICAL POLYCLINIC": "50-000007",
    "TRI CARE CLINIC": "50-000012",
};

export const WARBA_BANK_INFO: CloverBankInfo[] = [
    { 
        accountName: "AL ASEEL INTERNATIONAL POLYCLINIC", 
        oldAccountNo: "1447461012", 
        accountNo: "WTAA-61012", 
        activities: "1194", 
        propertyId: "CLO3", 
        country: "01", 
        departments: "113", 
        projectId: "104" 
    },
    { 
        accountName: "IRIS POLYCLINIC", 
        oldAccountNo: "1267173018", 
        accountNo: "WRIR-73018", 
        activities: "1193", 
        propertyId: "CLO3", 
        country: "01", 
        departments: "113", 
        projectId: "104" 
    },
    { 
        accountName: "YARROW POLYCLINIC", 
        oldAccountNo: "1452467011", 
        accountNo: "WRYR-67011", 
        activities: "1198", 
        propertyId: "CLO3", 
        country: "01", 
        departments: "113", 
        projectId: "104" 
    },
    { 
        accountName: "MEWL POLYCLINIC", 
        oldAccountNo: "11010236601", 
        accountNo: "KIBML-6601", 
        activities: "1205", 
        propertyId: "CLO4", 
        country: "01", 
        departments: "113", 
        projectId: "104" 
    },
    { 
        accountName: "FOURTH MEDICAL CENTER", 
        oldAccountNo: "1447455018", 
        accountNo: "WRFM-55018", 
        activities: "1195", 
        propertyId: "CLO5", 
        country: "01", 
        departments: "113", 
        projectId: "104" 
    },
    { 
        accountName: "JOYA POLYCLINIC", 
        oldAccountNo: "1449310018", 
        accountNo: "WRJY-10018", 
        activities: "1197", 
        propertyId: "CLO6", 
        country: "01", 
        departments: "113", 
        projectId: "104" 
    },
    { 
        accountName: "MEDICAL HARBOUR CENTER", 
        oldAccountNo: "1447386019", 
        accountNo: "WRMH-86019", 
        activities: "1196", 
        propertyId: "CLO6", 
        country: "01", 
        departments: "113", 
        projectId: "104" 
    },
    { 
        accountName: "MED MARINE POLYCLINIC", 
        oldAccountNo: "1447342013", 
        accountNo: "WRMM-42013", 
        activities: "1191", 
        propertyId: "CLO6", 
        country: "01", 
        departments: "113", 
        projectId: "104" 
    },
    { 
        accountName: "MED GRAY POLYCLINIC", 
        oldAccountNo: "1447377018", 
        accountNo: "WRMG-77018", 
        activities: "1192", 
        propertyId: "CLO7", 
        country: "01", 
        departments: "113", 
        projectId: "104" 
    },
    { 
        accountName: "ARAM MEDICAL POLYCLINIC", 
        oldAccountNo: "1447395018", 
        accountNo: "WRAM-95018", 
        activities: "1199", 
        propertyId: "CLO8", 
        country: "01", 
        departments: "113", 
        projectId: "104" 
    },
    { 
        accountName: "TRI CARE CLINIC", 
        oldAccountNo: "1610054019", 
        accountNo: "WRTR-54019", 
        activities: "1211", 
        propertyId: "CLO8", 
        country: "01", 
        departments: "113", 
        projectId: "104" 
    },
];

export const WARBA_VENDOR_OFFSET_ACCOUNTS: VendorOffsetAccounts = {
    "AL ASEEL INTERNATIONAL POLYCLINIC": "50-000010",
    "IRIS POLYCLINIC": "50-000004",
    "YARROW POLYCLINIC": "50-000005",
    "MEWL POLYCLINIC": "50-000011",
    "FOURTH MEDICAL CENTER": "50-000009",
    "JOYA POLYCLINIC": "50-000002",
    "MEDICAL HARBOUR CENTER": "50-000008",
    "MED MARINE POLYCLINIC": "50-000006",
    "MED GRAY POLYCLINIC": "50-000003",
    "ARAM MEDICAL POLYCLINIC": "50-000007",
    "TRI CARE CLINIC": "50-000012",
    "Warba Medical Polyclinic": "60-000001",
};

export const ACCOUNT_NO_TO_OFFSET_MAPPING: { [key: string]: string } = {
    "KIBJY-2258": "50-000002",
    "KIBJY-2266": "50-000002",
    "KIBMG-2320": "50-000003",
    "KIBMG-2339": "50-000003",
    "KIBMG-2347": "50-000003",
    "KIBMG-1630": "50-000003",
    "KIBIR-2282": "50-000004",
    "KIBIR-2304": "50-000004",
    "KIBIR-8645": "50-000004",
    "KIBYR-4765": "50-000005",
    "KIBYR-4773": "50-000005",
    "KIBMM-2207": "50-000006",
    "KIBMM-2215": "50-000006",
    "KIBMM-2223": "50-000006",
    "KIBMM-1656": "50-000006",
    "KIBAM-2290": "50-000007",
    "KIBAM-1680": "50-000007",
    "KIBAM-3577": "50-000007",
    "KIBMH-2231": "50-000008",
    "KIBMH-2240": "50-000008",
    "KIBFR-2770": "50-000009",
    "KIBFR-2789": "50-000009",
    "KIBFR-8602": "50-000009",
    "KIBAA-2380": "50-000010",
    "KIBAA-2398": "50-000010",
    "KIBAA-2401": "50-000010",
    "KIBML-6601": "50-000011",
    "KIBML-6610": "50-000011",
    "KIBTR-5252": "50-000012",
    "KIBTR-3810": "50-000012",
};


export const OUTPUT_HEADER = [
  "Journal Number", "Journal Name", "Line Num", "Posting Date", "Account Type", 
  "Account No", "Description", "Debit Amount", "Credit Amount", "Currency Code", 
  "Exchange Rate", "Offset Account Type", "Offset Account", "Invoice No", "Document No", 
  "Document Date", "Due Date", "Asset Trans Type", "Posting Profile", "Payment Mode", 
  "Payment Reference", "Number of Voucher", "Activities", "Country", "Departments", 
  "Project_ID", "Property_ID", "Unit_ID"
];

export const BATCH_MAPPING: Record<string, { description: string, bankAccount: string, last4: string }> = {
  "50-001248": { description: "KIBAA2380/INVESTORSLARY/MAR-26/TT", bankAccount: "KIBAA-2380 : KIB-Al Aseel-0110-10-232-380", last4: "2380" },
  "50-001249": { description: "KIBAA2380/INVESTORSLARY/MAR-26/PMT", bankAccount: "KIBAA-2380 : KIB-Al Aseel-0110-10-232-380", last4: "2380" },
  "50-001278": { description: "KIBAM-3577 – POS Insurance & Utilities", bankAccount: "KIBAM-3577 : KIB-Aram-011010223577", last4: "3577" },
  "50-001279": { description: "KIBFR-8602 – POS Insurance & Utilities", bankAccount: "KIBFR-8602 : KIB-Fourth0110-10-198-602", last4: "8602" },
  "50-001280": { description: "KIBJY-2258 – POS Rent", bankAccount: "KIBJY-2258 : KIB-JOYA0110-10-232-258", last4: "2258" },
  "50-001281": { description: "KIBMH-2231 – POS Insurance & Utilities", bankAccount: "KIBMH-2231 : KIB-MH0110-10-232-231", last4: "2231" }
};

// Bahrain Customer Master (mirrored from backend)
export const BAHRAIN_CUSTOMER_MASTER: Record<string, { code: string, name: string }> = {
  "BHW1-C-12": { code: "24-000033", name: "Savon Company WLL" },
  "BHW1-C-25": { code: "24-000032", name: "Crown Gold W.L.L" },
  "BHW1-C-21": { code: "24-000035", name: "Baraka Sweets Factory" },
  "BHW1-C-9":  { code: "24-000053", name: "WAED INDUSTRIAL INNOVATION COMPANY W.L.L" },
};

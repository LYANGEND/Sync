export interface Payment {
    id: string;
    studentId: string;
    amount: number;
    paymentDate: string;
    method: 'CASH' | 'MOBILE_MONEY' | 'BANK_DEPOSIT';
    transactionId?: string;
    notes?: string;
    status: 'COMPLETED' | 'CANCELLED' | 'PENDING';
    voidReason?: string;
    // Mobile Money fields
    mobileMoneyOperator?: string;
    mobileMoneyPhone?: string;
    mobileMoneyRef?: string;
    mobileMoneyStatus?: string;
    mobileMoneyConfirmedAt?: string;
    mobileMoneyFee?: number;
    student: {
        firstName: string;
        lastName: string;
        admissionNumber: string;
        guardianEmail?: string;
        guardianPhone?: string;
        parent?: {
            email?: string;
            fullName?: string;
        };
        class?: {
            id: string;
            name: string;
        };
    };
    recordedBy: {
        fullName: string;
    };
}

export interface FeeTemplate {
    id: string;
    name: string;
    amount: number;
    academicTermId: string;
    applicableGrade: number;
    academicTerm: {
        name: string;
    };
}

export interface AcademicTerm {
    id: string;
    name: string;
}

export interface Class {
    id: string;
    name: string;
}

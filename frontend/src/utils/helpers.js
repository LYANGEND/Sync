// Format currency in ZMW
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-ZM', {
    style: 'currency',
    currency: 'ZMW',
    minimumFractionDigits: 2,
  }).format(amount);
};

// Format date in Zambian format (DD/MM/YYYY)
export const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

// Format date for input fields (YYYY-MM-DD)
export const formatDateForInput = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

// Get payment status badge class
export const getPaymentStatusClass = (status) => {
  switch (status) {
    case 'Paid':
      return 'badge-success';
    case 'Partial':
      return 'badge-warning';
    case 'Pending':
      return 'badge-danger';
    default:
      return 'badge-secondary';
  }
};

// Get attendance status badge class
export const getAttendanceStatusClass = (status) => {
  switch (status) {
    case 'Present':
      return 'badge-success';
    case 'Late':
      return 'badge-warning';
    case 'Absent':
      return 'badge-danger';
    case 'Excused':
      return 'badge-info';
    default:
      return 'badge-secondary';
  }
};

// Calculate age from date of birth
export const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return '';
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

// Get current academic year
export const getCurrentAcademicYear = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  
  // Academic year typically starts in January in Zambia
  if (month >= 1 && month <= 12) {
    return `${year}`;
  }
  return `${year}`;
};

// Get current term based on date
export const getCurrentTerm = () => {
  const today = new Date();
  const month = today.getMonth() + 1;
  
  // Zambian school terms (approximate):
  // Term 1: January - April
  // Term 2: May - August
  // Term 3: September - December
  if (month >= 1 && month <= 4) return 'Term 1';
  if (month >= 5 && month <= 8) return 'Term 2';
  return 'Term 3';
};

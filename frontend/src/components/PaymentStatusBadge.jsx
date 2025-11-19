import React from 'react';
import { getPaymentStatusClass } from '../utils/helpers';

const PaymentStatusBadge = ({ status }) => {
  return (
    <span className={`badge ${getPaymentStatusClass(status)}`}>
      {status}
    </span>
  );
};

export default PaymentStatusBadge;

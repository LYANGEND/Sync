import React from 'react';
import { getAttendanceStatusClass } from '../utils/helpers';

const AttendanceStatusBadge = ({ status }) => {
  return (
    <span className={`badge ${getAttendanceStatusClass(status)}`}>
      {status}
    </span>
  );
};

export default AttendanceStatusBadge;

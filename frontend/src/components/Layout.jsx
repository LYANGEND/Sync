import React from 'react';
import { NavLink } from 'react-router-dom';

const Layout = ({ children }) => {
  return (
    <div>
      <nav className="navbar">
        <div className="container">
          <NavLink to="/" className="navbar-brand">
            Sync
          </NavLink>
          <ul className="nav-links">
            <li>
              <NavLink to="/">Dashboard</NavLink>
            </li>
            <li>
              <NavLink to="/students">Students</NavLink>
            </li>
            <li>
              <NavLink to="/payments">Payments</NavLink>
            </li>
            <li>
              <NavLink to="/attendance">Attendance</NavLink>
            </li>
            <li>
              <NavLink to="/classes">Classes</NavLink>
            </li>
            <li>
              <NavLink to="/teachers">Teachers</NavLink>
            </li>
          </ul>
        </div>
      </nav>
      <main>
        {children}
      </main>
    </div>
  );
};

export default Layout;

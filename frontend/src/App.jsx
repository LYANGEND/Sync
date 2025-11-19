import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Payments from './pages/Payments';
import StudentsOwing from './pages/StudentsOwing';
import Attendance from './pages/Attendance';
import Classes from './pages/Classes';
import Teachers from './pages/Teachers';
import './index.css';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/students" element={<Students />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/payments/owing" element={<StudentsOwing />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/classes" element={<Classes />} />
          <Route path="/teachers" element={<Teachers />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;

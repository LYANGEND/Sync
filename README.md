<a name="readme-top"></a>

<div align="center">
  <h1><b>Sync - School Management System</b></h1>
  <p>A modern, mobile-first school management system for Zambian schools</p>
</div>

# 📗 Table of Contents

- [📖 About the Project](#about-project)
  - [🛠 Built With](#built-with)
  - [Key Features](#key-features)
- [💻 Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
  - [Installation](#installation)
  - [Usage](#usage)
- [👥 Authors](#authors)
- [🔭 Future Features](#future-features)
- [🤝 Contributing](#contributing)
- [⭐️ Show your support](#support)
- [📝 License](#license)

# 📖 Sync School Management System <a name="about-project"></a>

**Sync** is a comprehensive school management system specifically designed for Zambian schools. It simplifies administrative tasks for non-technical teachers with an intuitive, mobile-first interface. The system handles student profiles, payment tracking, attendance management, and class administration.

The system is optimized for the Zambian educational context with:
- ZMW currency formatting
- Local date formats (DD/MM/YYYY)
- Class levels: Baby, Primary, and Secondary
- Academic term structure (Term 1, 2, 3)

## 🛠 Built With <a name="built-with"></a>

### Tech Stack

- **Frontend**: React.js with Vite
- **Backend**: Node.js with Express.js
- **Database**: MongoDB with Mongoose ODM
- **Styling**: Custom CSS with mobile-first responsive design

### Key Features <a name="key-features"></a>

- **Student Profile Management**: Comprehensive student records with class assignments (Baby/Primary/Secondary)
- **Payment Tracking System**: Monitor school fees with payment status badges and "Students Owing" dashboard
- **One-Tap Attendance**: Quick and easy attendance marking system for teachers
- **Class Management**: Organize classes with teacher assignments
- **Mobile-First Design**: Optimized for smartphones and tablets used by teachers
- **Zambian Localization**: ZMW currency, local date formats, and term structure

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## 💻 Getting Started <a name="getting-started"></a>

To get a local copy up and running, follow these steps.

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn package manager

### Setup

Clone this repository:

```sh
git clone https://github.com/LYANGEND/Sync.git
cd Sync
```

### Installation

Install dependencies for both backend and frontend:

```sh
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Configuration

Create a `.env` file in the backend directory:

```sh
cd backend
cp .env.example .env
```

Update the `.env` file with your MongoDB connection string:

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/sync-school-management
NODE_ENV=development
```

### Usage

Run the backend server:

```sh
cd backend
npm run dev
```

The backend will start on http://localhost:5000

In a new terminal, run the frontend:

```sh
cd frontend
npm run dev
```

The frontend will start on http://localhost:3000

### Default Setup

The system comes with:
- Empty database ready for data entry
- RESTful API endpoints for all features
- Mobile-responsive UI

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## 👥 Authors <a name="authors"></a>

👤 **LYANGEND**

- GitHub: [@LYANGEND](https://github.com/LYANGEND)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## 🔭 Future Features <a name="future-features"></a>

- [ ] **SMS Notifications** - Send automated SMS to parents for fee reminders and attendance alerts
- [ ] **Report Generation** - Generate PDF reports for student performance and payment history
- [ ] **Mobile App** - Native mobile applications for iOS and Android
- [ ] **Biometric Attendance** - Fingerprint or face recognition for attendance marking
- [ ] **Gradebook** - Track and manage student grades and performance
- [ ] **Parent Portal** - Allow parents to view their child's progress and payments online

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## 🤝 Contributing <a name="contributing"></a>

Contributions, issues, and feature requests are welcome!

Feel free to check the [issues page](../../issues/).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## ⭐️ Show your support <a name="support"></a>

If you like this project and find it useful for your school, please give it a ⭐️!

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->

## 📝 License <a name="license"></a>

This project is [MIT](./LICENSE) licensed.

_NOTE: we recommend using the [MIT license](https://choosealicense.com/licenses/mit/) - you can set it up quickly by [using templates available on GitHub](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/adding-a-license-to-a-repository). You can also use [any other license](https://choosealicense.com/licenses/) if you wish._

<p align="right">(<a href="#readme-top">back to top</a>)</p>

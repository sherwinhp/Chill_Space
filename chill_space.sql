-- Schema aligned to the provided table/field list.

CREATE TABLE venues (
  venue_id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  location VARCHAR(255) NOT NULL
);

CREATE TABLE users (
  user_id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  student_status BOOLEAN DEFAULT FALSE,
  student_id VARCHAR(60),
  venue_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (venue_id) REFERENCES venues (venue_id)
);

CREATE TABLE rooms (
  room_id INT PRIMARY KEY AUTO_INCREMENT,
  venue_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  capacity INT NOT NULL,
  hourly_rate DECIMAL(10, 2) NOT NULL,
  FOREIGN KEY (venue_id) REFERENCES venues (venue_id)
);

CREATE TABLE bookings (
  booking_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  room_id INT NOT NULL,
  booking_time DATETIME NOT NULL,
  payment_status VARCHAR(40) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (user_id),
  FOREIGN KEY (room_id) REFERENCES rooms (room_id)
);

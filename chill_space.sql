CREATE DATABASE  IF NOT EXISTS `chill_space` /*!40100 DEFAULT CHARACTER SET latin1 */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `chill_space`;
-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: chill_space
-- ------------------------------------------------------
-- Server version	8.4.7

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `booking_holds`
--

DROP TABLE IF EXISTS `booking_holds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `booking_holds` (
  `hold_id` int NOT NULL AUTO_INCREMENT,
  `room_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `start_time` datetime NOT NULL,
  `end_time` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`hold_id`),
  KEY `room_id` (`room_id`),
  KEY `user_id` (`user_id`),
  KEY `expires_at` (`expires_at`),
  CONSTRAINT `booking_holds_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`room_id`) ON DELETE CASCADE,
  CONSTRAINT `booking_holds_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `booking_holds`
--

LOCK TABLES `booking_holds` WRITE;
/*!40000 ALTER TABLE `booking_holds` DISABLE KEYS */;
INSERT INTO `booking_holds` VALUES (2,1,NULL,'2026-01-22 12:00:00','2026-01-22 14:00:00','9999-12-31 23:59:59','2026-01-22 15:31:46');
/*!40000 ALTER TABLE `booking_holds` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `booking_menu_items`
--

DROP TABLE IF EXISTS `booking_menu_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `booking_menu_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `item_id` int NOT NULL,
  `quantity` int DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `booking_id` (`booking_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `booking_menu_items_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`) ON DELETE CASCADE,
  CONSTRAINT `booking_menu_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`item_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `booking_menu_items`
--

LOCK TABLES `booking_menu_items` WRITE;
/*!40000 ALTER TABLE `booking_menu_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `booking_menu_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bookings`
--

DROP TABLE IF EXISTS `bookings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bookings` (
  `booking_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `room_id` int NOT NULL,
  `start_time` datetime NOT NULL,
  `end_time` datetime NOT NULL,
  `pax` int DEFAULT '1',
  `total_price` decimal(10,2) DEFAULT NULL,
  `payment_status` enum('pending','paid','cancelled') DEFAULT 'pending',
  `admin_status` enum('pending','approved','declined') DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`booking_id`),
  KEY `user_id` (`user_id`),
  KEY `room_id` (`room_id`),
  CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `bookings_ibfk_2` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`room_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bookings`
--

LOCK TABLES `bookings` WRITE;
/*!40000 ALTER TABLE `bookings` DISABLE KEYS */;
INSERT INTO `bookings` VALUES (1,1,1,'2026-01-29 11:00:00','2026-01-29 12:00:00',1,12.00,'paid','approved','2026-01-27 06:33:58'),(2,3,1,'2026-01-28 15:00:00','2026-01-28 16:00:00',1,12.00,'paid','pending','2026-01-27 07:11:17'),(3,1,1,'2026-01-29 16:00:00','2026-01-29 17:00:00',1,12.00,'paid','pending','2026-01-27 10:12:29'),(4,1,1,'2026-01-27 15:00:00','2026-01-27 17:00:00',1,24.00,'paid','pending','2026-01-27 10:12:29');
/*!40000 ALTER TABLE `bookings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cart_items`
--

DROP TABLE IF EXISTS `cart_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cart_items` (
  `cart_item_id` int NOT NULL AUTO_INCREMENT,
  `session_id` varchar(64) DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `item_type` enum('menu','room_booking') NOT NULL,
  `item_id` int DEFAULT NULL,
  `item_name` varchar(180) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `qty` int NOT NULL DEFAULT '1',
  `details` varchar(255) DEFAULT NULL,
  `room_id` int DEFAULT NULL,
  `start_time` datetime DEFAULT NULL,
  `end_time` datetime DEFAULT NULL,
  `hold_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`cart_item_id`),
  KEY `session_id` (`session_id`),
  KEY `user_id` (`user_id`),
  KEY `item_id` (`item_id`),
  KEY `room_id` (`room_id`),
  KEY `cart_items_ibfk_3` (`hold_id`),
  CONSTRAINT `cart_items_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `cart_items_ibfk_2` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`room_id`) ON DELETE SET NULL,
  CONSTRAINT `cart_items_ibfk_3` FOREIGN KEY (`hold_id`) REFERENCES `booking_holds` (`hold_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cart_items`
--

LOCK TABLES `cart_items` WRITE;
/*!40000 ALTER TABLE `cart_items` DISABLE KEYS */;
INSERT INTO `cart_items` VALUES (2,'3e9bd3c4c9e964859a946b202af442c4',NULL,'room_booking',NULL,'Gamer Room 1 booking',24.00,1,'Thu, 22 Jan 08:00 pm-10:00 pm',1,'2026-01-22 12:00:00','2026-01-22 14:00:00',2,'2026-01-22 15:31:46');
/*!40000 ALTER TABLE `cart_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `events`
--

DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `events` (
  `event_id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(150) NOT NULL,
  `description` text,
  `event_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `events`
--

LOCK TABLES `events` WRITE;
/*!40000 ALTER TABLE `events` DISABLE KEYS */;
/*!40000 ALTER TABLE `events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `menu_items`
--

DROP TABLE IF EXISTS `menu_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_items` (
  `item_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `category` enum('food','drink','addon') NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `description` text,
  `image_url` varchar(255) DEFAULT NULL,
  `is_available` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `menu_items`
--

LOCK TABLES `menu_items` WRITE;
/*!40000 ALTER TABLE `menu_items` DISABLE KEYS */;
INSERT INTO `menu_items` VALUES (1,'Pizza Party Box','food',25.00,'2 large pizzas with assorted toppings','/images/Pizza Party Box.png',1,'2026-01-26 03:21:11'),(2,'Snack Attack Bundle','food',12.00,'Chips, popcorn, candy & pretzels','/images/Snack Attack Bundle.jpg',1,'2026-01-26 03:21:11'),(3,'Wings & Fries Combo','food',18.00,'Crispy wings with seasoned fries','/images/Wings & Fries Combo.jpg',1,'2026-01-26 03:21:11'),(4,'Nachos Supreme','food',15.00,'Loaded nachos with all the toppings','/images/Nachos Supreme.jpg',1,'2026-01-26 03:21:11'),(5,'Burger Basket','food',22.00,'4 burgers with fries','/images/Burger Basket.jpg',1,'2026-01-26 03:21:11'),(6,'Coke Float','drink',4.00,'Homemade coke topped off with vanilla ice cream','/uploads/1769496400417-2705251.png',1,'2026-01-27 06:46:40');
/*!40000 ALTER TABLE `menu_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `promotions`
--

DROP TABLE IF EXISTS `promotions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `promotions` (
  `promo_id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(150) NOT NULL,
  `description` text,
  `code` varchar(40) DEFAULT NULL,
  `discount_percent` int DEFAULT NULL,
  `min_total` decimal(10,2) DEFAULT '0.00',
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`promo_id`),
  CONSTRAINT `promotions_chk_1` CHECK ((`discount_percent` between 1 and 100))
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `promotions`
--

LOCK TABLES `promotions` WRITE;
/*!40000 ALTER TABLE `promotions` DISABLE KEYS */;
/*!40000 ALTER TABLE `promotions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reviews`
--

DROP TABLE IF EXISTS `reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reviews` (
  `review_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `room_id` int DEFAULT NULL,
  `rating` int NOT NULL,
  `rating_food` int NOT NULL DEFAULT '0',
  `rating_service` int NOT NULL DEFAULT '0',
  `comment` text NOT NULL,
  `category` enum('room','food','service') NOT NULL DEFAULT 'room',
  `is_visible` tinyint(1) NOT NULL DEFAULT '1',
  `image_url` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `admin_reply` text,
  PRIMARY KEY (`review_id`),
  KEY `user_id` (`user_id`),
  KEY `room_id` (`room_id`),
  CONSTRAINT `reviews_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `reviews_ibfk_2` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`room_id`) ON DELETE CASCADE,
  CONSTRAINT `reviews_chk_1` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reviews`
--

LOCK TABLES `reviews` WRITE;
/*!40000 ALTER TABLE `reviews` DISABLE KEYS */;
INSERT INTO `reviews` VALUES (1,1,1,3,3,2,'It was mid','room',0,NULL,'2026-01-25 11:59:27','2026-01-27 06:50:51','We are so sorry for your experience! please let us know if you have any improvements for us to accomodate to your needs!'),(2,1,1,5,5,5,'Amazing place!','room',1,NULL,'2026-01-27 06:34:26','2026-01-27 06:34:26',NULL);
/*!40000 ALTER TABLE `reviews` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rooms`
--

DROP TABLE IF EXISTS `rooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rooms` (
  `room_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `subtitle` varchar(120) DEFAULT '',
  `description` text,
  `capacity` int NOT NULL,
  `hourly_rate` decimal(10,2) NOT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `features` text,
  `is_available` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`room_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rooms`
--

LOCK TABLES `rooms` WRITE;
/*!40000 ALTER TABLE `rooms` DISABLE KEYS */;
INSERT INTO `rooms` VALUES (1,'Gamer Room 1','','Good Gaming Room',1,12.00,'/uploads/1769092826605-694259129.jpg','',1,'2026-01-22 14:40:26');
/*!40000 ALTER TABLE `rooms` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transaction_items`
--

DROP TABLE IF EXISTS `transaction_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaction_items` (
  `transaction_item_id` int NOT NULL AUTO_INCREMENT,
  `transaction_id` int NOT NULL,
  `item_type` enum('menu','room_booking') NOT NULL,
  `item_id` int DEFAULT NULL,
  `item_name` varchar(180) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `qty` int NOT NULL DEFAULT '1',
  `subtotal` decimal(10,2) NOT NULL,
  `details` varchar(255) DEFAULT NULL,
  `room_id` int DEFAULT NULL,
  `start_time` datetime DEFAULT NULL,
  `end_time` datetime DEFAULT NULL,
  PRIMARY KEY (`transaction_item_id`),
  KEY `transaction_id` (`transaction_id`),
  KEY `item_id` (`item_id`),
  KEY `room_id` (`room_id`),
  CONSTRAINT `transaction_items_ibfk_1` FOREIGN KEY (`transaction_id`) REFERENCES `transactions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `transaction_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`item_id`) ON DELETE SET NULL,
  CONSTRAINT `transaction_items_ibfk_3` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`room_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transaction_items`
--

LOCK TABLES `transaction_items` WRITE;
/*!40000 ALTER TABLE `transaction_items` DISABLE KEYS */;
INSERT INTO `transaction_items` VALUES (1,1,'room_booking',NULL,'Gamer Room 1 booking',12.00,1,12.00,'Thu, 29 Jan 07:00 pm-08:00 pm',1,'2026-01-29 19:00:00','2026-01-29 20:00:00'),(2,1,'menu',2,'Snack Attack Bundle',12.00,1,12.00,NULL,NULL,NULL,NULL),(3,2,'menu',6,'Coke Float',4.00,1,4.00,NULL,NULL,NULL,NULL),(4,2,'room_booking',NULL,'Gamer Room 1 booking',12.00,1,12.00,'Wed, 28 Jan 03:00 pm-04:00 pm',1,'2026-01-28 15:00:00','2026-01-28 16:00:00'),(5,3,'menu',2,'Snack Attack Bundle',12.00,1,12.00,NULL,NULL,NULL,NULL),(6,3,'room_booking',NULL,'Gamer Room 1 booking',12.00,1,12.00,'Thu, 29 Jan 04:00 pm-05:00 pm',1,'2026-01-29 16:00:00','2026-01-29 17:00:00'),(7,3,'menu',2,'Snack Attack Bundle',12.00,1,12.00,NULL,NULL,NULL,NULL),(8,3,'menu',1,'Pizza Party Box',25.00,1,25.00,NULL,NULL,NULL,NULL),(9,3,'room_booking',NULL,'Gamer Room 1 booking',24.00,1,24.00,'Tue, 27 Jan 03:00 pm-05:00 pm',1,'2026-01-27 15:00:00','2026-01-27 17:00:00');
/*!40000 ALTER TABLE `transaction_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transactions`
--

DROP TABLE IF EXISTS `transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `orderId` varchar(64) NOT NULL,
  `payerId` varchar(64) NOT NULL,
  `payerEmail` varchar(255) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `currency` varchar(8) NOT NULL,
  `status` varchar(32) NOT NULL,
  `time` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transactions`
--

LOCK TABLES `transactions` WRITE;
/*!40000 ALTER TABLE `transactions` DISABLE KEYS */;
INSERT INTO `transactions` VALUES (1,1,'17291413SB5919646','CX6RAPRHDL85J','angelomiguelcasia@gmail.com',24.00,'SGD','COMPLETED','2026-01-27 14:33:58'),(2,3,'7M948182TD708312U','CX6RAPRHDL85J','angelomiguelcasia@gmail.com',16.00,'SGD','COMPLETED','2026-01-27 15:11:18'),(3,1,'9J582609K3787842R','CX6RAPRHDL85J','angelomiguelcasia@gmail.com',85.00,'SGD','COMPLETED','2026-01-27 18:12:29');
/*!40000 ALTER TABLE `transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `email` varchar(120) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','user') NOT NULL DEFAULT 'user',
  `address` varchar(255) DEFAULT NULL,
  `contact_number` varchar(40) DEFAULT NULL,
  `avatar_url` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'peter','peter@peter.com','P@$$w0rd','user','bukit batok, blk 234, #02-134','81234567',NULL,1,'2026-01-22 14:25:51'),(2,'admin','admin@admin.com','P@$$w0rd','admin','Republic Poly ','82317232',NULL,1,'2026-01-22 14:27:13'),(3,'sherwin','sherwin@sherwin.com','P@$$w0rd','user','khatib blk 847','11112222',NULL,1,'2026-01-27 07:10:23');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `venues`
--

DROP TABLE IF EXISTS `venues`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `venues` (
  `venue_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `location` varchar(255) NOT NULL,
  PRIMARY KEY (`venue_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `venues`
--

LOCK TABLES `venues` WRITE;
/*!40000 ALTER TABLE `venues` DISABLE KEYS */;
/*!40000 ALTER TABLE `venues` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-27 18:30:25
USE chill_space;

-- 1) Wallet balance per user
CREATE TABLE IF NOT EXISTS wallets (
  user_id INT NOT NULL,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_wallets_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- 2) Wallet transaction ledger
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  type ENUM('topup','payment','refund','adjustment','reward') NOT NULL,
  amount_cents BIGINT NOT NULL,
  status ENUM('pending','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  provider ENUM('paypal','wallet','system') NOT NULL,
  provider_ref VARCHAR(255) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wallet_transactions_user (user_id),
  KEY idx_wallet_transactions_created (created_at),
  UNIQUE KEY uq_wallet_provider_ref (provider, provider_ref),
  CONSTRAINT fk_wallet_transactions_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- If wallet_transactions already exists but WITHOUT 'reward', run this too:
ALTER TABLE wallet_transactions
  MODIFY COLUMN type ENUM('topup','payment','refund','adjustment','reward') NOT NULL;




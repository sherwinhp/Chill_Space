CREATE DATABASE  IF NOT EXISTS `chill_space` /*!40100 DEFAULT CHARACTER SET latin1 */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `chill_space`;
-- MySQL dump 10.13  Distrib 8.0.42, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: chill_space
-- ------------------------------------------------------
-- Server version	8.4.5

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
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `actor_id` int DEFAULT NULL,
  `actor_role` varchar(20) DEFAULT 'admin',
  `action` varchar(80) NOT NULL,
  `target_type` varchar(40) DEFAULT NULL,
  `target_id` int DEFAULT NULL,
  `details` text,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_audit_actor` (`actor_id`),
  KEY `idx_audit_target` (`target_type`,`target_id`),
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
INSERT INTO `audit_logs` VALUES (1,2,'admin','refund.approve','refund',3,'amount=24.24','::1','2026-02-06 18:55:57'),(2,2,'admin','refund.approve','refund',4,'amount=15','::1','2026-02-06 18:58:46'),(3,2,'admin','refund.approve','refund',5,'amount=9',NULL,'2026-02-06 19:03:18'),(4,2,'admin','refund.approve','refund',5,'amount=9','::1','2026-02-06 19:03:21'),(5,2,'admin','refund.approve','refund',6,'amount=9','::1','2026-02-06 19:08:33');
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bonuses_claimed`
--

DROP TABLE IF EXISTS `bonuses_claimed`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bonuses_claimed` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `bonus_type` enum('birthday','anniversary') NOT NULL,
  `claim_year` int NOT NULL,
  `claimed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bonus_claim` (`user_id`,`bonus_type`,`claim_year`),
  CONSTRAINT `fk_bonuses_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bonuses_claimed`
--

LOCK TABLES `bonuses_claimed` WRITE;
/*!40000 ALTER TABLE `bonuses_claimed` DISABLE KEYS */;
INSERT INTO `bonuses_claimed` VALUES (1,6,'birthday',2026,'2026-02-05 22:35:00');
/*!40000 ALTER TABLE `bonuses_claimed` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `booking_holds`
--

LOCK TABLES `booking_holds` WRITE;
/*!40000 ALTER TABLE `booking_holds` DISABLE KEYS */;
INSERT INTO `booking_holds` VALUES (2,1,NULL,'2026-01-22 12:00:00','2026-01-22 14:00:00','9999-12-31 23:59:59','2026-01-22 15:31:46'),(8,1,4,'2026-02-09 19:00:00','2026-02-09 20:00:00','9999-12-31 23:59:59','2026-02-05 17:35:38'),(9,1,NULL,'2026-02-26 17:00:00','2026-02-26 18:00:00','9999-12-31 23:59:59','2026-02-05 21:14:39'),(11,2,8,'2026-02-28 19:00:00','2026-02-28 20:00:00','9999-12-31 23:59:59','2026-02-05 23:49:52');
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
  `payment_status` enum('pending','paid','cancelled','refunded','partially_refunded','refund_denied') DEFAULT 'pending',
  `admin_status` enum('pending','approved','declined') DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`booking_id`),
  KEY `user_id` (`user_id`),
  KEY `room_id` (`room_id`),
  CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `bookings_ibfk_2` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`room_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bookings`
--

LOCK TABLES `bookings` WRITE;
/*!40000 ALTER TABLE `bookings` DISABLE KEYS */;
INSERT INTO `bookings` VALUES (1,1,1,'2026-01-29 11:00:00','2026-01-29 12:00:00',1,12.00,'paid','approved','2026-01-27 06:33:58'),(2,3,1,'2026-01-28 15:00:00','2026-01-28 16:00:00',1,12.00,'paid','pending','2026-01-27 07:11:17'),(3,1,1,'2026-01-29 16:00:00','2026-01-29 17:00:00',1,12.00,'paid','pending','2026-01-27 10:12:29'),(4,1,1,'2026-01-27 15:00:00','2026-01-27 17:00:00',1,24.00,'paid','pending','2026-01-27 10:12:29'),(5,4,1,'2026-02-26 19:00:00','2026-02-26 20:00:00',1,15.00,'refunded','pending','2026-02-05 17:28:09'),(6,6,1,'2026-02-17 19:00:00','2026-02-17 22:00:00',1,45.00,'paid','pending','2026-02-05 22:34:53'),(7,9,2,'2026-02-06 14:00:00','2026-02-06 19:00:00',1,90.00,'paid','pending','2026-02-06 03:25:03'),(8,9,1,'2026-02-06 21:00:00','2026-02-06 22:00:00',1,15.00,'partially_refunded','pending','2026-02-06 10:50:16');
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
  `item_type` enum('menu','room_booking','event') NOT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=60 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cart_items`
--

LOCK TABLES `cart_items` WRITE;
/*!40000 ALTER TABLE `cart_items` DISABLE KEYS */;
INSERT INTO `cart_items` VALUES (2,'3e9bd3c4c9e964859a946b202af442c4',NULL,'room_booking',NULL,'Gamer Room 1 booking',24.00,1,'Thu, 22 Jan 08:00 pm-10:00 pm',1,'2026-01-22 12:00:00','2026-01-22 14:00:00',2,'2026-01-22 15:31:46'),(16,'d74e09139c4567a69302ac57d7cecc51',4,'room_booking',NULL,'Gamer Room 1 booking',15.00,1,'Mon, 9 Feb 07:00 pm-08:00 pm',1,'2026-02-09 19:00:00','2026-02-09 20:00:00',8,'2026-02-05 17:35:38'),(18,'f70bb184dde0486a4687ecbd90ec1fbd',NULL,'room_booking',NULL,'Gamer Room 1 booking',12.00,1,'Thu, 26 Feb 05:00 pm-06:00 pm',1,'2026-02-26 17:00:00','2026-02-26 18:00:00',9,'2026-02-05 21:14:39'),(25,'d67867d14112573cf289708fe0a1aaba',6,'menu',2,'Snack Attack Bundle',12.00,1,'',NULL,NULL,NULL,NULL,'2026-02-05 22:41:30'),(27,'388eddc2202656fce67c6a3eb695a11a',8,'room_booking',NULL,'Gamer Room 2 booking',18.00,1,'Sat, 28 Feb 07:00 pm-08:00 pm',2,'2026-02-28 19:00:00','2026-02-28 20:00:00',11,'2026-02-05 23:49:52'),(28,'388eddc2202656fce67c6a3eb695a11a',8,'menu',3,'Wings & Fries Combo',15.30,1,'Room add-on for Gamer Room 2',2,NULL,NULL,NULL,'2026-02-05 23:49:53'),(29,'388eddc2202656fce67c6a3eb695a11a',8,'menu',6,'Coke Float',3.40,1,'Room add-on for Gamer Room 2',2,NULL,NULL,NULL,'2026-02-05 23:49:54'),(30,'388eddc2202656fce67c6a3eb695a11a',8,'menu',5,'Burger Basket',18.70,1,'Room add-on for Gamer Room 2',2,NULL,NULL,NULL,'2026-02-05 23:49:55'),(31,'388eddc2202656fce67c6a3eb695a11a',8,'menu',4,'Nachos Supreme',12.75,1,'Room add-on for Gamer Room 2',2,NULL,NULL,NULL,'2026-02-05 23:49:56'),(32,'388eddc2202656fce67c6a3eb695a11a',8,'menu',1,'Pizza Party Box',21.25,1,'Room add-on for Gamer Room 2',2,NULL,NULL,NULL,'2026-02-05 23:49:57'),(33,NULL,8,'menu',NULL,'Promo: Weekend Special (WEEKEND10)',-8.94,1,'promo:WEEKEND10',NULL,NULL,NULL,NULL,'2026-02-05 23:50:19'),(51,NULL,2,'menu',2,'Snack Attack Bundle',12.00,1,'',NULL,NULL,NULL,NULL,'2026-02-06 08:40:29'),(53,NULL,2,'menu',7,'Birthday party Decaoration',15.00,1,'',NULL,NULL,NULL,NULL,'2026-02-06 09:12:23');
/*!40000 ALTER TABLE `cart_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `compliance_flags`
--

DROP TABLE IF EXISTS `compliance_flags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `compliance_flags` (
  `flag_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `related_type` enum('transaction','refund','account','payment') DEFAULT 'transaction',
  `related_id` int DEFAULT NULL,
  `severity` enum('low','medium','high') DEFAULT 'medium',
  `reason` varchar(255) NOT NULL,
  `details` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` datetime DEFAULT NULL,
  `resolved_by` int DEFAULT NULL,
  PRIMARY KEY (`flag_id`),
  KEY `idx_compliance_user` (`user_id`),
  KEY `idx_compliance_related` (`related_type`,`related_id`),
  KEY `fk_compliance_resolved_by` (`resolved_by`),
  CONSTRAINT `fk_compliance_resolved_by` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_compliance_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compliance_flags`
--

LOCK TABLES `compliance_flags` WRITE;
/*!40000 ALTER TABLE `compliance_flags` DISABLE KEYS */;
INSERT INTO `compliance_flags` VALUES (1,9,'payment',NULL,'medium','High purchase velocity','3 transactions in 60 minutes | context=grabpay_create | ip=::1','2026-02-06 18:52:28',NULL,NULL),(2,9,'payment',NULL,'medium','High purchase velocity','3 transactions in 60 minutes | context=grabpay_finalize | ip=n/a','2026-02-06 18:52:45',NULL,NULL),(3,9,'payment',NULL,'medium','High purchase velocity','4 transactions in 60 minutes | context=paypal_button_create | ip=::1','2026-02-06 19:02:04',NULL,NULL),(4,9,'payment',NULL,'medium','High purchase velocity','4 transactions in 60 minutes | context=paypal_capture | ip=::1','2026-02-06 19:02:17',NULL,NULL),(5,9,'payment',NULL,'medium','High purchase velocity','5 transactions in 60 minutes | context=paypal_button_create | ip=::1','2026-02-06 19:06:54',NULL,NULL);
/*!40000 ALTER TABLE `compliance_flags` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `event_signups`
--

DROP TABLE IF EXISTS `event_signups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `event_signups` (
  `signup_id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `user_id` int NOT NULL,
  `pax` int NOT NULL DEFAULT '1',
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `payment_status` enum('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`signup_id`),
  UNIQUE KEY `uq_event_signups_event_user` (`event_id`,`user_id`),
  KEY `idx_event_signups_event` (`event_id`),
  KEY `idx_event_signups_user` (`user_id`),
  CONSTRAINT `fk_event_signups_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`event_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_event_signups_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `event_signups`
--

LOCK TABLES `event_signups` WRITE;
/*!40000 ALTER TABLE `event_signups` DISABLE KEYS */;
/*!40000 ALTER TABLE `event_signups` ENABLE KEYS */;
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
  `capacity` int DEFAULT NULL,
  `entry_fee` decimal(10,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`event_id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `events`
--

LOCK TABLES `events` WRITE;
/*!40000 ALTER TABLE `events` DISABLE KEYS */;
INSERT INTO `events` VALUES (1,'Weekly Valorant Tournament','5v5 bracket. Sign up online. Entry fee paid online. Prize pool: 1st $200, 2nd $70, 3rd $30 + vouchers.','2026-02-14','2026-02-14','/uploads/weekly-valorant.jpg','2026-02-05 20:53:39',30,25.00),(5,'Weekly FIFA 1v1 Tournament','1v1 single-elimination. Match: 6 min halves, default squads, penalties ON. Prize pool split: Top 3 = 60/30/10 + voucher.','2026-02-13','2026-02-13','/uploads/fifa-tournament.jpg','2026-02-05 23:44:31',16,10.00),(6,'Movie Marathon Night','Free entry movie marathon. Snacks available for purchase. Walk-ins welcome.','2026-01-20','2026-01-20','/uploads/movie-marathon.jpg','2026-02-05 23:52:47',NULL,0.00),(7,'Football Watch Party Night','Live football screening with community vibes. Free entry, walk-ins welcome. Snacks & drinks available onsite.','2026-02-18','2026-02-18','/uploads/football-watch.jpg','2026-02-06 00:01:33',NULL,0.00);
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
  `stock_qty` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `menu_items`
--

LOCK TABLES `menu_items` WRITE;
/*!40000 ALTER TABLE `menu_items` DISABLE KEYS */;
INSERT INTO `menu_items` VALUES (2,'Snack Attack Bundle','food',12.00,'Chips, popcorn, candy & pretzels','/images/Snack Attack Bundle.jpg',1,19,'2026-01-26 03:21:11'),(3,'Wings & Fries Combo','food',18.00,'Crispy wings with seasoned fries','/images/Wings & Fries Combo.jpg',1,1,'2026-01-26 03:21:11'),(4,'Nachos Supreme','food',10.00,'Loaded nachos with all the toppings','/images/Nachos Supreme.jpg',1,4,'2026-01-26 03:21:11'),(5,'Burger Basket','food',22.00,'4 burgers with fries','/images/Burger Basket.jpg',1,2,'2026-01-26 03:21:11'),(6,'Coke Float','drink',4.00,'Homemade coke topped off with vanilla ice cream','/uploads/1769496400417-2705251.png',1,NULL,'2026-01-27 06:46:40'),(7,'Birthday party Decaoration','addon',15.00,'Ballon cake and everything is prepared','/uploads/1770365651918-95882187.jpg',1,NULL,'2026-02-06 08:14:11'),(8,'Snack Attack Bundle ','food',25.00,'Awesome platter','/uploads/1770366929404-370988018.jpg',1,12,'2026-02-06 08:35:29');
/*!40000 ALTER TABLE `menu_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_reads`
--

DROP TABLE IF EXISTS `notification_reads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_reads` (
  `user_id` int NOT NULL,
  `last_seen` datetime NOT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_notification_reads_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_reads`
--

LOCK TABLES `notification_reads` WRITE;
/*!40000 ALTER TABLE `notification_reads` DISABLE KEYS */;
INSERT INTO `notification_reads` VALUES (9,'2026-02-06 13:29:30','2026-02-06 05:29:30');
/*!40000 ALTER TABLE `notification_reads` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_resets`
--

DROP TABLE IF EXISTS `password_resets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_resets` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token` varchar(128) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_password_resets_token` (`token`),
  KEY `idx_password_resets_user` (`user_id`),
  CONSTRAINT `fk_password_resets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_resets`
--

LOCK TABLES `password_resets` WRITE;
/*!40000 ALTER TABLE `password_resets` DISABLE KEYS */;
/*!40000 ALTER TABLE `password_resets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payment_methods`
--

DROP TABLE IF EXISTS `payment_methods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_methods` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `provider` varchar(32) NOT NULL,
  `token` varchar(128) NOT NULL,
  `brand` varchar(32) NOT NULL,
  `last4` varchar(4) NOT NULL,
  `funding` enum('credit','debit','prepaid','unknown') DEFAULT 'unknown',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_methods_provider_token` (`provider`,`token`),
  KEY `idx_payment_methods_user` (`user_id`),
  CONSTRAINT `fk_payment_methods_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment_methods`
--

LOCK TABLES `payment_methods` WRITE;
/*!40000 ALTER TABLE `payment_methods` DISABLE KEYS */;
/*!40000 ALTER TABLE `payment_methods` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `promotions`
--

LOCK TABLES `promotions` WRITE;
/*!40000 ALTER TABLE `promotions` DISABLE KEYS */;
INSERT INTO `promotions` VALUES (1,'Welcome','10% off for new accounts (first purchase only)','FIRST10',10,0.00,'2026-02-01','2026-12-31','','2026-02-05 23:27:36'),(2,'Friday Off','5% off on Fridays only (min spend $30)','FRIDAYOFF',5,30.00,'2026-02-01','2026-12-31','','2026-02-05 23:39:42'),(3,'Weekday Deal','5% off Mon–Thu','WEEKDAY5',5,0.00,'2026-02-01','2026-12-31','','2026-02-05 23:41:15'),(4,'Happy Hour','10% off during happy hour','HAPPY10',10,0.00,'2026-02-01','2026-12-31','','2026-02-05 23:41:15'),(5,'Weekend Special','10% off Fri–Sun (min spend $40)','WEEKEND10',10,40.00,'2026-02-01','2026-12-31','','2026-02-05 23:41:15'),(6,'Spend $50 Save 7%','7% off when you spend $50 or more','SAVE7',7,50.00,'2026-02-01','2026-12-31','','2026-02-05 23:41:15');
/*!40000 ALTER TABLE `promotions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `refund_requests`
--

DROP TABLE IF EXISTS `refund_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `refund_requests` (
  `refund_id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int DEFAULT NULL,
  `transaction_id` int DEFAULT NULL,
  `user_id` int NOT NULL,
  `reason_text` text,
  `user_message` text,
  `image_url` varchar(255) DEFAULT NULL,
  `requested_amount` decimal(10,2) DEFAULT NULL,
  `approved_amount` decimal(10,2) DEFAULT NULL,
  `status` enum('pending','approved','denied','failed') NOT NULL DEFAULT 'pending',
  `admin_note` text,
  `provider` varchar(32) DEFAULT NULL,
  `provider_ref` varchar(255) DEFAULT NULL,
  `refund_provider_ref` varchar(255) DEFAULT NULL,
  `failure_reason` text,
  `failure_code` varchar(80) DEFAULT NULL,
  `approved_by` int DEFAULT NULL,
  `denied_by` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `denied_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`refund_id`),
  UNIQUE KEY `unique_refund_booking` (`booking_id`),
  UNIQUE KEY `unique_refund_transaction` (`transaction_id`),
  KEY `refund_user_id` (`user_id`),
  KEY `refund_status` (`status`),
  KEY `refund_provider` (`provider`),
  KEY `refund_requests_ibfk_3` (`approved_by`),
  KEY `refund_requests_ibfk_4` (`denied_by`),
  KEY `refund_transaction_id` (`transaction_id`),
  CONSTRAINT `refund_requests_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`) ON DELETE CASCADE,
  CONSTRAINT `refund_requests_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `refund_requests_ibfk_3` FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `refund_requests_ibfk_4` FOREIGN KEY (`denied_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `refund_requests_ibfk_transaction` FOREIGN KEY (`transaction_id`) REFERENCES `transactions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `refund_requests`
--

LOCK TABLES `refund_requests` WRITE;
/*!40000 ALTER TABLE `refund_requests` DISABLE KEYS */;
INSERT INTO `refund_requests` VALUES (1,5,NULL,4,'Schedule change',NULL,NULL,15.00,15.00,'approved',NULL,'grabpay','STRIPE-GRABPAY-cs_test_a1ZNEKauBHQ9g8kqp11sbxl3ARYQVV5lUC0Xu9mFyzTAz6dWMhtkc7PJc0','pyr_1SxWQfCwQXyx3LBkAoTjhfaQ',NULL,NULL,2,NULL,'2026-02-05 17:33:21',NULL,'2026-02-05 17:31:40','2026-02-05 17:33:20'),(2,NULL,10,9,'Food issue (quality/temperature)','Food cold',NULL,6.00,6.00,'approved',NULL,'stripe_card','STRIPE-CARD-pi_3Sxiw5IJ2audlMHu177ibtqV','re_3Sxiw5IJ2audlMHu1EHE28oj',NULL,NULL,2,NULL,'2026-02-06 07:32:59',NULL,'2026-02-06 07:32:22','2026-02-06 07:32:58'),(3,NULL,11,9,'Room or facility issue','Bad got smoking smeelll',NULL,24.24,24.24,'approved','Manual refund required for provider: paynow.','paynow','HITPAY-a103c117-b823-458d-ac5c-e2990b8430f0',NULL,NULL,NULL,2,NULL,'2026-02-06 10:55:57',NULL,'2026-02-06 10:55:29','2026-02-06 10:55:57'),(4,NULL,12,9,'Food issue (quality/temperature)','eat stomach pain',NULL,15.00,15.00,'approved',NULL,'grabpay','STRIPE-GRABPAY-cs_test_b1zL6uY9kz4FUycOscnpuMlz689krh6SjF1IotYGC4nl18yx9itXIQCA2u','pyr_1SxmkLIJ2audlMHuAbaRc3GT',NULL,NULL,2,NULL,'2026-02-06 10:58:47',NULL,'2026-02-06 10:58:23','2026-02-06 10:58:46'),(5,NULL,13,9,'Food issue (quality/temperature)','Lousyy no taste',NULL,9.00,9.00,'approved',NULL,'paypal','60F93929U75165427','4CD32287G8221781A',NULL,NULL,2,NULL,'2026-02-06 11:03:21',NULL,'2026-02-06 11:02:44','2026-02-06 11:03:21'),(6,NULL,14,9,'Food issue (quality/temperature)','Bad food weak',NULL,9.00,9.00,'approved',NULL,'stripe_card','STRIPE-CARD-pi_3SxmssIJ2audlMHu07ouWt1s','re_3SxmssIJ2audlMHu0IZmWTkm',NULL,NULL,2,NULL,'2026-02-06 11:08:34',NULL,'2026-02-06 11:07:56','2026-02-06 11:08:33');
/*!40000 ALTER TABLE `refund_requests` ENABLE KEYS */;
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
  `normal_hourly_rate` decimal(10,2) DEFAULT NULL,
  `peak_hourly_rate` decimal(10,2) DEFAULT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `features` text,
  `is_available` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`room_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rooms`
--

LOCK TABLES `rooms` WRITE;
/*!40000 ALTER TABLE `rooms` DISABLE KEYS */;
INSERT INTO `rooms` VALUES (1,'Gamer Room 1','','Good Gaming Room',1,12.00,15.00,'/uploads/gamer-room-1.jpg','PC setup, Headsets, RGB lighting',1,'2026-01-22 14:40:26'),(2,'Gamer Room 2','Duo Gaming Room','Duo gaming room with two PC setups for friends',2,18.00,18.00,'/uploads/gamer-room-2.jpg','Dual PC setup, Headsets, RGB lighting',1,'2026-02-05 06:35:05'),(3,'Squad Room','4 Pax Team Room','Team gaming room with 4 PC setups for squad matches and group sessions',4,30.00,30.00,'/uploads/squad-room.jpg','4 PC setup, Team seating, Large display, RGB lighting',1,'2026-02-05 06:44:49'),(4,'VR Room','Immersive VR Experience','VR-ready room with motion play area and safety space for immersive games',2,25.00,30.00,'/uploads/vr-room.jpg',NULL,1,'2026-02-05 06:48:50'),(5,'Sleeping Room','sleeping','Sleeping room very very nice',1,12.00,18.00,'/uploads/1770280375653-11062950.jpg','',1,'2026-02-05 08:32:55');
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
  `item_type` enum('menu','room_booking','event') NOT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transaction_items`
--

LOCK TABLES `transaction_items` WRITE;
/*!40000 ALTER TABLE `transaction_items` DISABLE KEYS */;
INSERT INTO `transaction_items` VALUES (1,1,'room_booking',NULL,'Gamer Room 1 booking',12.00,1,12.00,'Thu, 29 Jan 07:00 pm-08:00 pm',1,'2026-01-29 19:00:00','2026-01-29 20:00:00'),(2,1,'menu',2,'Snack Attack Bundle',12.00,1,12.00,NULL,NULL,NULL,NULL),(3,2,'menu',6,'Coke Float',4.00,1,4.00,NULL,NULL,NULL,NULL),(4,2,'room_booking',NULL,'Gamer Room 1 booking',12.00,1,12.00,'Wed, 28 Jan 03:00 pm-04:00 pm',1,'2026-01-28 15:00:00','2026-01-28 16:00:00'),(5,3,'menu',2,'Snack Attack Bundle',12.00,1,12.00,NULL,NULL,NULL,NULL),(6,3,'room_booking',NULL,'Gamer Room 1 booking',12.00,1,12.00,'Thu, 29 Jan 04:00 pm-05:00 pm',1,'2026-01-29 16:00:00','2026-01-29 17:00:00'),(7,3,'menu',2,'Snack Attack Bundle',12.00,1,12.00,NULL,NULL,NULL,NULL),(8,3,'menu',NULL,'Pizza Party Box',25.00,1,25.00,NULL,NULL,NULL,NULL),(9,3,'room_booking',NULL,'Gamer Room 1 booking',24.00,1,24.00,'Tue, 27 Jan 03:00 pm-05:00 pm',1,'2026-01-27 15:00:00','2026-01-27 17:00:00'),(10,4,'menu',NULL,'Pizza Party Box',25.00,1,25.00,NULL,NULL,NULL,NULL),(11,5,'room_booking',NULL,'Gamer Room 1 booking',15.00,1,15.00,'Thu, 26 Feb 07:00 pm-08:00 pm',1,'2026-02-26 19:00:00','2026-02-26 20:00:00'),(13,7,'menu',4,'Nachos Supreme',15.00,1,15.00,NULL,NULL,NULL,NULL),(14,7,'menu',5,'Burger Basket',22.00,2,44.00,NULL,NULL,NULL,NULL),(15,7,'menu',3,'Wings & Fries Combo',18.00,1,18.00,NULL,NULL,NULL,NULL),(16,7,'menu',2,'Snack Attack Bundle',12.00,1,12.00,NULL,NULL,NULL,NULL),(17,7,'menu',NULL,'Pizza Party Box',25.00,1,25.00,NULL,NULL,NULL,NULL),(18,7,'room_booking',NULL,'Gamer Room 1 booking',45.00,1,45.00,'Tue, 17 Feb 07:00 pm-10:00 pm',1,'2026-02-17 19:00:00','2026-02-17 22:00:00'),(20,9,'menu',NULL,'Promo: Welcome (FIRST10)',-11.22,1,-11.22,'promo:FIRST10',NULL,NULL,NULL),(21,9,'menu',2,'Snack Attack Bundle',12.00,1,12.00,NULL,NULL,NULL,NULL),(22,9,'room_booking',NULL,'Gamer Room 2 booking',90.00,1,90.00,'Fri, 6 Feb 02:00 pm-07:00 pm',2,'2026-02-06 14:00:00','2026-02-06 19:00:00'),(23,9,'menu',2,'Snack Attack Bundle',10.20,1,10.20,'Room add-on for Gamer Room 2',2,NULL,NULL),(24,10,'menu',2,'Snack Attack Bundle',12.00,1,12.00,NULL,NULL,NULL,NULL),(25,11,'room_booking',NULL,'Gamer Room 1 booking',15.00,1,15.00,'Fri, 6 Feb 09:00 pm-10:00 pm',1,'2026-02-06 21:00:00','2026-02-06 22:00:00'),(26,11,'menu',3,'Wings & Fries Combo',15.30,1,15.30,'Room add-on for Gamer Room 1',1,NULL,NULL),(27,12,'menu',3,'Wings & Fries Combo',18.00,1,18.00,NULL,NULL,NULL,NULL),(28,12,'menu',2,'Snack Attack Bundle',12.00,1,12.00,NULL,NULL,NULL,NULL),(29,13,'menu',3,'Wings & Fries Combo',18.00,1,18.00,NULL,NULL,NULL,NULL),(30,14,'menu',3,'Wings & Fries Combo',18.00,1,18.00,NULL,NULL,NULL,NULL);
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
  `orderId` varchar(255) NOT NULL,
  `payerId` varchar(255) NOT NULL,
  `payerEmail` varchar(255) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `currency` varchar(8) NOT NULL,
  `status` varchar(32) NOT NULL,
  `time` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transactions`
--

LOCK TABLES `transactions` WRITE;
/*!40000 ALTER TABLE `transactions` DISABLE KEYS */;
INSERT INTO `transactions` VALUES (1,1,'17291413SB5919646','CX6RAPRHDL85J','angelomiguelcasia@gmail.com',24.00,'SGD','COMPLETED','2026-01-27 14:33:58'),(2,3,'7M948182TD708312U','CX6RAPRHDL85J','angelomiguelcasia@gmail.com',16.00,'SGD','COMPLETED','2026-01-27 15:11:18'),(3,1,'9J582609K3787842R','CX6RAPRHDL85J','angelomiguelcasia@gmail.com',85.00,'SGD','COMPLETED','2026-01-27 18:12:29'),(4,1,'HITPAY-a0ffd0b0-58b0-46ca-bb1d-b30535c6fb7d','a0ffd0b0-58b0-46ca-bb1d-b30535c6fb7d','peter@peter.com',25.00,'SGD','COMPLETED','2026-02-04 19:50:02'),(5,4,'STRIPE-GRABPAY-cs_test_a1ZNEKauBHQ9g8kqp11sbxl3ARYQVV5lUC0Xu9mFyzTAz6dWMhtkc7PJc0','pi_3SxWLYCwQXyx3LBk0ppTRv7r','sherwinchow2005@gmail.com',15.00,'SGD','COMPLETED','2026-02-06 01:28:09'),(7,6,'STRIPE-GRABPAY-cs_test_b1Jx8HADdwYe3oo84PbtkyYsyGr7sH9kL4x93nnUt7S5EuREUAlITrKhAl','pi_3Sxb8EEgOsvBH7JV0EHXEJbx','christinejoyteh0309@gmail.com',159.00,'SGD','COMPLETED','2026-02-06 06:34:54'),(9,9,'STRIPE-GRABPAY-cs_test_a1KfC9GavlP1egdAyp5o3A8id7KhTShG5tFnB6iKCz3YkyYQfKGvZh5nDl','pi_3Sxff9IJ2audlMHu1agu6M7Z','tanaaron20@gmail.com',100.98,'SGD','COMPLETED','2026-02-06 11:25:03'),(10,9,'STRIPE-CARD-pi_3Sxiw5IJ2audlMHu177ibtqV','pm_1Sxiw4IJ2audlMHuLPGNWtXo','tanaaron20@gmail.com',12.00,'SGD','COMPLETED','2026-02-06 14:54:38'),(11,9,'HITPAY-a103c117-b823-458d-ac5c-e2990b8430f0','a103c117-b823-458d-ac5c-e2990b8430f0','tanaaron20@gmail.com',30.30,'SGD','COMPLETED','2026-02-06 18:50:17'),(12,9,'STRIPE-GRABPAY-cs_test_b1zL6uY9kz4FUycOscnpuMlz689krh6SjF1IotYGC4nl18yx9itXIQCA2u','pi_3SxmeOIJ2audlMHu18mxVIjE','tanaaron20@gmail.com',30.00,'SGD','COMPLETED','2026-02-06 18:52:45'),(13,9,'60F93929U75165427','BAEKLEJWTQJZ8','Aaron2404@personal.example.com',18.00,'SGD','COMPLETED','2026-02-06 19:02:18'),(14,9,'STRIPE-CARD-pi_3SxmssIJ2audlMHu07ouWt1s','pm_1SxmsrIJ2audlMHu1IrBTBUs','tanaaron20@gmail.com',18.00,'SGD','COMPLETED','2026-02-06 19:07:35');
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
  `birth_date` date DEFAULT NULL,
  `membership_tier` varchar(16) NOT NULL DEFAULT 'Bronze',
  `avatar_url` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `kyc_status` enum('unverified','pending','verified','rejected','blocked') DEFAULT 'unverified',
  `kyc_checked_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'peter','peter@peter.com','P@$$w0rd','user','bukit batok, blk 234, #02-134','81234567',NULL,'Bronze',NULL,1,'2026-01-22 14:25:51','unverified',NULL),(2,'admin','admin@admin.com','scrypt$31ca6f9508231f438e0f2f90d034c665$eb41fddce547a42b751173d38338583be1b206bd392de60e7c169458004dbcea966baa162f2d76d80aee82333272c85aca5457ed1650374269c39d3904b6344f','admin','Republic Poly ','82317232',NULL,'Bronze',NULL,1,'2026-01-22 14:27:13','unverified',NULL),(3,'sherwin','sherwin@sherwin.com','P@$$w0rd','user','khatib blk 847','11112222',NULL,'Bronze',NULL,1,'2026-01-27 07:10:23','unverified',NULL),(4,'sherwin','sherwinchow2005@gmail.com','Surewin$','user','108','90183913',NULL,'Bronze',NULL,1,'2026-02-05 17:24:48','unverified',NULL),(6,'christinejoyteh0309@gmail.com','christinejoyteh0309@gmail.com','P@$$w0rd','user','123 Bedok North St 1','98765432','2026-02-05','Silver','/uploads/1770332322873-465574105.png',1,'2026-02-05 22:33:30','unverified',NULL),(8,'syazwan','syazzieee11@gmail.com','Password!','user','woodland','94477346',NULL,'Bronze',NULL,1,'2026-02-05 23:23:43','unverified',NULL),(9,'tanaaron20','tanaaron20@gmail.com','scrypt$b8928100dd4026d015123be4a0a12ec9$f065ea5052fef00027d205d26b417d64a0292dd4ba014c5b9368ebf11dd95e7b4c2711c5a4046ef2b500e24ba6f2dfd792ac0afcc16d20d6c4c4caa45ab94c2c','user','Jurongwest St 62','83095889','2005-11-11','Silver','/uploads/1770354312842-397908394.jpg',1,'2026-02-06 00:36:30','unverified',NULL);
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

--
-- Table structure for table `wallet_transactions`
--

DROP TABLE IF EXISTS `wallet_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wallet_transactions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `type` enum('topup','payment','refund','adjustment','reward') NOT NULL,
  `entry_type` enum('credit','debit','reversal') NOT NULL DEFAULT 'credit',
  `amount_cents` bigint NOT NULL,
  `status` enum('pending','completed','failed','cancelled','expired') NOT NULL DEFAULT 'pending',
  `provider` enum('paypal','wallet','system','hitpay','nets','grabpay','stripe') NOT NULL,
  `provider_ref` varchar(255) DEFAULT NULL,
  `related_order_id` int DEFAULT NULL,
  `related_booking_id` int DEFAULT NULL,
  `release_at` datetime DEFAULT NULL,
  `released_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `expired_at` datetime DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wallet_provider_ref` (`provider`,`provider_ref`),
  KEY `idx_wallet_transactions_user` (`user_id`),
  KEY `idx_wallet_transactions_created` (`created_at`),
  CONSTRAINT `fk_wallet_transactions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wallet_transactions`
--

LOCK TABLES `wallet_transactions` WRITE;
/*!40000 ALTER TABLE `wallet_transactions` DISABLE KEYS */;
INSERT INTO `wallet_transactions` VALUES (1,4,'reward','credit',75,'completed','system','order_cashback:5',NULL,NULL,NULL,NULL,NULL,NULL,'{\"label\": \"Order Cashback\", \"currency\": \"SGD\", \"cashback_rate\": 0.05, \"cashback_cents\": 75, \"transaction_id\": 5, \"reward_base_type\": \"invoice_total\", \"reward_base_cents\": 1500}','2026-02-05 17:28:09'),(2,4,'adjustment','credit',-75,'completed','system','order_cashback_reversal:5',NULL,NULL,NULL,NULL,NULL,NULL,'{\"label\": \"Cashback Reversal\", \"reversal_reason\": \"booking_refunded_or_cancelled\", \"reversed_transaction_ref\": \"order_cashback:5\"}','2026-02-05 17:33:20'),(4,6,'reward','credit',477,'completed','system','order_cashback_pending:7',7,NULL,'2026-02-06 06:35:54','2026-02-06 06:38:01',NULL,NULL,'{\"label\": \"Order Cashback Pending\", \"currency\": \"SGD\", \"cashback_rate\": 0.03, \"cashback_cents\": 477, \"transaction_id\": 7, \"membership_tier\": \"Silver\", \"reward_base_type\": \"invoice_total\", \"reward_base_cents\": 15900}','2026-02-05 22:34:53'),(5,6,'reward','credit',500,'completed','system','bonus:birthday:2026',NULL,NULL,NULL,NULL,NULL,NULL,'{\"label\": \"Birthday Bonus\", \"bonus_type\": \"birthday\", \"bonus_year\": 2026}','2026-02-05 22:35:00'),(7,6,'reward','credit',477,'completed','system','order_cashback_release:7',7,NULL,NULL,'2026-02-06 06:38:01','2026-08-06 06:38:01',NULL,'{\"label\": \"Cashback Released\", \"pending_tx_id\": 4}','2026-02-05 22:38:01'),(8,6,'topup','credit',500,'pending','paypal','0SL64246E88965050',NULL,NULL,NULL,NULL,NULL,NULL,'{\"amount\": \"5.00\", \"source\": \"wallet_topup\", \"orderId\": \"0SL64246E88965050\"}','2026-02-05 22:54:33'),(9,6,'topup','credit',500,'pending','paypal','2M447422K47267638',NULL,NULL,NULL,NULL,NULL,NULL,'{\"amount\": \"5.00\", \"source\": \"wallet_topup\", \"orderId\": \"2M447422K47267638\"}','2026-02-05 22:55:03'),(11,9,'reward','credit',303,'completed','system','order_cashback_pending:9',9,NULL,'2026-02-06 11:26:03','2026-02-06 11:56:52',NULL,NULL,'{\"label\": \"Order Cashback Pending\", \"currency\": \"SGD\", \"cashback_rate\": 0.03, \"cashback_cents\": 303, \"transaction_id\": 9, \"membership_tier\": \"Silver\", \"reward_base_type\": \"invoice_total\", \"reward_base_cents\": 10098}','2026-02-06 03:25:03'),(12,9,'reward','credit',303,'completed','system','order_cashback_release:9',9,NULL,NULL,'2026-02-06 11:56:52','2026-08-06 11:56:52',NULL,'{\"label\": \"Cashback Released\", \"pending_tx_id\": 11}','2026-02-06 03:56:51'),(13,9,'topup','credit',2000,'completed','paypal','710692850M209463U',NULL,NULL,NULL,NULL,NULL,NULL,'{\"id\": \"710692850M209463U\", \"links\": [{\"rel\": \"self\", \"href\": \"https://api.sandbox.paypal.com/v2/checkout/orders/710692850M209463U\", \"method\": \"GET\"}], \"payer\": {\"name\": {\"surname\": \"Piang\", \"given_name\": \"Aaron\"}, \"address\": {\"country_code\": \"SG\"}, \"payer_id\": \"BAEKLEJWTQJZ8\", \"email_address\": \"Aaron2404@personal.example.com\"}, \"status\": \"COMPLETED\", \"payment_source\": {\"paypal\": {\"name\": {\"surname\": \"Piang\", \"given_name\": \"Aaron\"}, \"address\": {\"country_code\": \"SG\"}, \"account_id\": \"BAEKLEJWTQJZ8\", \"email_address\": \"Aaron2404@personal.example.com\", \"account_status\": \"VERIFIED\"}}, \"purchase_units\": [{\"payments\": {\"captures\": [{\"id\": \"71C000693K071602F\", \"links\": [{\"rel\": \"self\", \"href\": \"https://api.sandbox.paypal.com/v2/payments/captures/71C000693K071602F\", \"method\": \"GET\"}, {\"rel\": \"refund\", \"href\": \"https://api.sandbox.paypal.com/v2/payments/captures/71C000693K071602F/refund\", \"method\": \"POST\"}, {\"rel\": \"up\", \"href\": \"https://api.sandbox.paypal.com/v2/checkout/orders/710692850M209463U\", \"method\": \"GET\"}], \"amount\": {\"value\": \"20.00\", \"currency_code\": \"SGD\"}, \"status\": \"COMPLETED\", \"create_time\": \"2026-02-06T04:34:54Z\", \"update_time\": \"2026-02-06T04:34:54Z\", \"final_capture\": true, \"seller_protection\": {\"status\": \"ELIGIBLE\", \"dispute_categories\": [\"ITEM_NOT_RECEIVED\", \"UNAUTHORIZED_TRANSACTION\"]}, \"seller_receivable_breakdown\": {\"net_amount\": {\"value\": \"18.82\", \"currency_code\": \"SGD\"}, \"paypal_fee\": {\"value\": \"1.18\", \"currency_code\": \"SGD\"}, \"gross_amount\": {\"value\": \"20.00\", \"currency_code\": \"SGD\"}}}]}, \"shipping\": {\"name\": {\"full_name\": \"Piang Aaron\"}, \"address\": {\"postal_code\": \"308123\", \"admin_area_2\": \"Singapore\", \"country_code\": \"SG\", \"address_line_1\": \"123 Thomson Rd.\"}}, \"reference_id\": \"default\"}]}','2026-02-06 04:32:45'),(14,9,'topup','credit',500,'pending','nets','07slnvutduja',NULL,NULL,NULL,NULL,NULL,NULL,'{\"source\": \"wallet_topup\", \"amountCents\": 500, \"txnRetrievalRef\": \"07slnvutduja\"}','2026-02-06 04:48:38'),(15,9,'topup','credit',500,'pending','hitpay','a1034019-f498-4516-81f6-b31d6c65cc8c',NULL,NULL,NULL,NULL,NULL,NULL,'{\"amount\": \"5.00\", \"source\": \"wallet_topup\", \"requestId\": \"a1034019-f498-4516-81f6-b31d6c65cc8c\"}','2026-02-06 04:48:42'),(16,9,'topup','credit',500,'pending','grabpay','cs_test_a1Kir1ZBfuirh5A9HhSh2vTy9LFPbdrvYP8z6J3ad0sKCETigVedN6RP3v',NULL,NULL,NULL,NULL,NULL,NULL,'{\"source\": \"wallet_topup\", \"sessionId\": \"cs_test_a1Kir1ZBfuirh5A9HhSh2vTy9LFPbdrvYP8z6J3ad0sKCETigVedN6RP3v\", \"amountCents\": 500}','2026-02-06 04:48:49'),(17,9,'reward','credit',36,'cancelled','system','order_cashback_pending:10',10,NULL,'2026-02-06 14:55:38','2026-02-06 15:32:59',NULL,NULL,'{\"label\": \"Order Cashback Pending\", \"currency\": \"SGD\", \"cashback_rate\": 0.03, \"cashback_cents\": 36, \"transaction_id\": 10, \"membership_tier\": \"Silver\", \"reward_base_type\": \"invoice_total\", \"reward_base_cents\": 1200}','2026-02-06 06:54:38'),(18,9,'adjustment','reversal',-36,'completed','system','order_cashback_reversal:10:pending',NULL,NULL,NULL,NULL,NULL,NULL,'{\"label\": \"Pending Cashback Cancelled\", \"reversal_reason\": \"refund_or_cancelled\", \"reversed_transaction_ref\": \"order_cashback_pending:10\"}','2026-02-06 07:32:58'),(19,9,'reward','credit',91,'cancelled','system','order_cashback_pending:11',11,NULL,'2026-02-06 18:51:17','2026-02-06 18:55:57',NULL,NULL,'{\"label\": \"Order Cashback Pending\", \"currency\": \"SGD\", \"cashback_rate\": 0.03, \"cashback_cents\": 91, \"transaction_id\": 11, \"membership_tier\": \"Silver\", \"reward_base_type\": \"invoice_total\", \"reward_base_cents\": 3030}','2026-02-06 10:50:16'),(20,9,'reward','credit',90,'completed','system','order_cashback_pending:12',12,NULL,'2026-02-06 18:53:45','2026-02-06 18:57:56',NULL,NULL,'{\"label\": \"Order Cashback Pending\", \"currency\": \"SGD\", \"cashback_rate\": 0.03, \"cashback_cents\": 90, \"transaction_id\": 12, \"membership_tier\": \"Silver\", \"reward_base_type\": \"invoice_total\", \"reward_base_cents\": 3000}','2026-02-06 10:52:45'),(21,9,'adjustment','reversal',-91,'completed','system','order_cashback_reversal:11:pending',NULL,NULL,NULL,NULL,NULL,NULL,'{\"label\": \"Pending Cashback Cancelled\", \"reversal_reason\": \"refund_or_cancelled\", \"reversed_transaction_ref\": \"order_cashback_pending:11\"}','2026-02-06 10:55:57'),(22,9,'reward','credit',90,'cancelled','system','order_cashback_release:12',12,NULL,NULL,'2026-02-06 18:57:56','2026-08-06 18:57:56','2026-02-06 18:58:47','{\"label\": \"Cashback Released\", \"pending_tx_id\": 20}','2026-02-06 10:57:56'),(23,9,'adjustment','reversal',-90,'completed','system','order_cashback_reversal:12',NULL,NULL,NULL,NULL,NULL,NULL,'{\"label\": \"Cashback Reversal\", \"reversal_reason\": \"refund_or_cancelled\", \"reversed_transaction_ref\": \"order_cashback_release:12\"}','2026-02-06 10:58:46'),(24,9,'reward','credit',54,'cancelled','system','order_cashback_pending:13',13,NULL,'2026-02-06 19:03:18','2026-02-06 19:03:19',NULL,NULL,'{\"label\": \"Order Cashback Pending\", \"currency\": \"SGD\", \"cashback_rate\": 0.03, \"cashback_cents\": 54, \"transaction_id\": 13, \"membership_tier\": \"Silver\", \"reward_base_type\": \"invoice_total\", \"reward_base_cents\": 1800}','2026-02-06 11:02:17'),(25,9,'adjustment','reversal',-54,'completed','system','order_cashback_reversal:13:pending',NULL,NULL,NULL,NULL,NULL,NULL,'{\"label\": \"Pending Cashback Cancelled\", \"reversal_reason\": \"refund_or_cancelled\", \"reversed_transaction_ref\": \"order_cashback_pending:13\"}','2026-02-06 11:03:18'),(26,9,'reward','credit',54,'cancelled','system','order_cashback_pending:14',14,NULL,'2026-02-06 19:08:35','2026-02-06 19:08:34',NULL,NULL,'{\"label\": \"Order Cashback Pending\", \"currency\": \"SGD\", \"cashback_rate\": 0.03, \"cashback_cents\": 54, \"transaction_id\": 14, \"membership_tier\": \"Silver\", \"reward_base_type\": \"invoice_total\", \"reward_base_cents\": 1800}','2026-02-06 11:07:35'),(27,9,'adjustment','reversal',-54,'completed','system','order_cashback_reversal:14:pending',NULL,NULL,NULL,NULL,NULL,NULL,'{\"label\": \"Pending Cashback Cancelled\", \"reversal_reason\": \"refund_or_cancelled\", \"reversed_transaction_ref\": \"order_cashback_pending:14\"}','2026-02-06 11:08:33');
/*!40000 ALTER TABLE `wallet_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `wallets`
--

DROP TABLE IF EXISTS `wallets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wallets` (
  `user_id` int NOT NULL,
  `balance_cents` bigint NOT NULL DEFAULT '0',
  `available_cents` bigint NOT NULL DEFAULT '0',
  `pending_cents` bigint NOT NULL DEFAULT '0',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_wallets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wallets`
--

LOCK TABLES `wallets` WRITE;
/*!40000 ALTER TABLE `wallets` DISABLE KEYS */;
INSERT INTO `wallets` VALUES (4,0,0,0,'2026-02-05 17:33:20'),(6,1477,1477,0,'2026-02-05 23:00:59'),(9,2303,2303,0,'2026-02-06 11:08:33');
/*!40000 ALTER TABLE `wallets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `watchlist`
--

DROP TABLE IF EXISTS `watchlist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `watchlist` (
  `watch_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) DEFAULT NULL,
  `email` varchar(120) DEFAULT NULL,
  `contact_number` varchar(40) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`watch_id`),
  UNIQUE KEY `uq_watch_email` (`email`),
  KEY `idx_watch_name` (`name`),
  KEY `idx_watch_contact` (`contact_number`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `watchlist`
--

LOCK TABLES `watchlist` WRITE;
/*!40000 ALTER TABLE `watchlist` DISABLE KEYS */;
/*!40000 ALTER TABLE `watchlist` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-06 19:13:05

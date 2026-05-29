# 🍜 Campus Canteen - Smart Canteen System

A comprehensive, real-time, full-stack web-based canteen management system designed specifically for college campuses. This system streamlines the food ordering process for students while providing powerful inventory management and analytics tools for vendors.

**Version:** 1.0.0  
**Status:** Production Ready  
**Last Updated:** 2026-05-29

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Project Vision & Purpose](#project-vision--purpose)
3. [Key Features](#key-features)
4. [System Architecture](#system-architecture)
5. [Technology Stack](#technology-stack)
6. [Project Structure](#project-structure)
7. [Setup & Installation](#setup--installation)
8. [Usage Guide](#usage-guide)
9. [API Documentation](#api-documentation)
10. [Database Schema](#database-schema)
11. [Real-Time Features](#real-time-features)
12. [Security Features](#security-features)
13. [Uniqueness & Innovation](#uniqueness--innovation)
14. [Deployment Guide](#deployment-guide)
15. [Troubleshooting](#troubleshooting)
16. [Future Enhancements](#future-enhancements)
17. [Contributing](#contributing)
18. [License](#license)

---

## 🎯 Overview

**Campus Canteen** is an intelligent, two-sided platform that transforms the traditional college canteen experience:

- **For Students**: A beautiful, intuitive app to browse menu items, place orders, make secure payments, and track real-time order status.
- **For Vendors**: A professional dashboard for order management, inventory tracking, QR code scanning, and AI-powered business insights.
- **For Campus**: Streamlined operations with automated inventory management and waste reduction.

### Core Statistics

- **Menu Items**: 22 pre-loaded food items with high-quality images
- **Real-time Sync**: WebSocket-powered instant updates across all clients
- **Database**: SQLite with zero external dependencies
- **Authentication**: Secure email/password system with OTP-based password reset
- **Payment Gateway**: Razorpay integration for secure transactions
- **Languages Supported**: English, Tamil, and Tanglish (code-mixed Tamil-English)

---

## 💡 Project Vision & Purpose

### The Problem

Traditional college canteens face several challenges:
- ❌ Long queues and waiting times
- ❌ Manual order tracking and paper receipts
- ❌ Inventory management is time-consuming
- ❌ No real-time stock visibility
- ❌ Poor data analytics for business decisions
- ❌ Difficult payment handling

### The Solution

Campus Canteen provides:
- ✅ **Instant Ordering**: Browse and order from anywhere on campus
- ✅ **Digital Receipts**: QR codes replace paper
- ✅ **Live Stock**: Real-time inventory synchronization
- ✅ **AI Assistant**: Smart recommendations based on budget and preferences
- ✅ **Business Analytics**: Predictive insights for vendors
- ✅ **Multilingual Support**: Caters to diverse user base

### Target Users

1. **College Students**: Primary customers who want quick, convenient food ordering
2. **Canteen Vendors/Owners**: Business operators managing food inventory and sales
3. **Campus Administration**: Monitors canteen operations and performance

---

## 🎨 Key Features

### 📱 Student App Features

#### Authentication & Profile
- ✅ Secure email/password login
- ✅ New account creation with validation
- ✅ OTP-based password reset via email
- ✅ Profile picture upload
- ✅ Personal profile management

#### Smart Menu Browsing
- ✅ **Category-based Navigation**: Rice & Noodles, Snacks, Breakfast, Beverages, Desserts
- ✅ **Real-time Stock Display**: See exact quantities available before ordering
- ✅ **Live Search**: Instant filtering by dish name
- ✅ **Beautiful Food Images**: High-quality photos for all 22 menu items
- ✅ **Emoji Integration**: Visual food category indicators

#### Budget-Smart AI Advisor 🤖
- ✅ **Budget Input**: Students enter their budget (e.g., ₹100)
- ✅ **Smart Recommendations**: AI suggests optimal meal combinations
- ✅ **Combo Generation**: Multiple options within budget (e.g., Main + Drink)
- ✅ **Popularity Factor**: Considers trending dishes and student preferences
- ✅ **Personalized Suggestions**: Based on order history

#### Shopping & Checkout
- ✅ **Shopping Cart Management**: Add/remove items with quantity controls
- ✅ **Real-time Price Calculation**: Instant total updates
- ✅ **Secure Payment**: Razorpay integration
- ✅ **Test Mode**: Auto-success for demonstration

#### QR Code Receipt System
- ✅ **Unique QR Generation**: Each order gets encrypted QR code
- ✅ **Order Details Embedded**: Order ID, items, price in QR
- ✅ **Zero-Paper System**: Digital-only receipts
- ✅ **Counter Fulfillment**: Show QR to vendor for collection

#### Order Tracking
- ✅ **Active Orders**: Real-time status updates
- ✅ **Order History**: Complete past order records
- ✅ **Date & Price Tracking**: Full transaction details
- ✅ **Order Search**: Filter by date or item name
- ✅ **Live Notifications**: Instant updates when order status changes

#### User Experience
- ✅ **Warm Orange Theme**: Welcoming, appetite-stimulating design
- ✅ **Responsive Design**: Works on mobile, tablet, desktop
- ✅ **One-Click Ordering**: Streamlined checkout process
- ✅ **Accessibility Features**: High contrast, readable fonts

### 🏪 Vendor Dashboard Features

#### Real-Time Business Analytics
- ✅ **Revenue Dashboard**: Today's total revenue at a glance
- ✅ **Order Count**: Number of orders placed today
- ✅ **30-Day Trends**: Sales charts and performance graphs
- ✅ **Peak Hours Analysis**: Identifies busiest times
- ✅ **Customer Insights**: Popular items and ordering patterns

#### Order Management
- ✅ **Live Notifications**: Sound alerts for new orders
- ✅ **Order Queue**: Display pending orders in real-time
- ✅ **QR Scanner**: Built-in camera-based QR code reading
- ✅ **SPACEBAR Completion**: Quick keyboard shortcut to mark order as done
- ✅ **Order History**: Complete records with timestamps
- ✅ **Order Filtering**: By date, status, customer

#### AI Business Advisor 🤖
- ✅ **Multilingual Support**: English, Tamil, Tanglish
- ✅ **Daily Predictions**: "What should I prepare tomorrow?"
- ✅ **Revenue Forecasting**: AI-predicted sales for next day
- ✅ **Ingredient Recommendations**: Quantity suggestions based on trends
- ✅ **Low Stock Alerts**: Warns about running low items
- ✅ **Seasonal Analysis**: Identifies high and low demand periods
- ✅ **Natural Language**: Conversational AI interface

#### Menu & Inventory Management
- ✅ **Add Menu Items**: Create new dishes with details
- ✅ **Edit Prices**: Update pricing instantly
- ✅ **In/Out of Stock Toggle**: Quick availability control
- ✅ **Item Description**: Add descriptions and specifications
- ✅ **Image Upload**: Add photos for menu items
- ✅ **Delete Items**: Remove discontinued dishes

#### Raw Material Inventory
- ✅ **Track Base Ingredients**: Rice, Chicken, Eggs, Vegetables, Noodles, etc.
- ✅ **Measure in KG & Units**: Flexible measurement systems
- ✅ **Stock Updates**: Manually update when new supplies arrive
- ✅ **Automatic Deduction**: System deducts ingredients when meals are sold
- ✅ **Low Stock Warnings**: Alerts for items below threshold
- ✅ **Inventory History**: Track consumption patterns

#### Canteen Operations Control
- ✅ **Operating Hours**: Set canteen opening and closing times
- ✅ **Status Management**: Open/Close toggle
- ✅ **Auto Status**: Automatic opening/closing based on college schedule
- ✅ **Holiday Management**: Mark special closure dates
- ✅ **Access Control**: Prevents orders when canteen is closed

#### Professional UI/UX
- ✅ **Dark Professional Theme**: Eye-friendly for long hours
- ✅ **Large Text Display**: Orders in BIG, readable font
- ✅ **Touch-Friendly**: Optimized for tablet/desktop
- ✅ **Dashboard at a Glance**: Key metrics on home page
- ✅ **Quick Navigation**: Easy access to all features

---

## 🏗️ System Architecture

### High-Level Architecture Diagram

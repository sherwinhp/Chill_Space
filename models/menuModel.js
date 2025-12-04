const menuItems = [
  { id: 1, name: "Pizza Party Box", price: 25, description: "2 large pizzas with assorted toppings", category: "Food" },
  { id: 2, name: "Snack Attack Bundle", price: 12, description: "Chips, popcorn, candy & pretzels", category: "Food" },
  { id: 3, name: "Wings & Fries Combo", price: 18, description: "Crispy wings with seasoned fries", category: "Food" },
  { id: 4, name: "Nachos Supreme", price: 14, description: "Loaded nachos with all the toppings", category: "Food" },
  { id: 5, name: "Burger Basket", price: 22, description: "4 burgers with fries", category: "Food" },
  { id: 6, name: "Sparkling Lemonade", price: 6, description: "Refreshing citrus fizz", category: "Beverages" },
  { id: 7, name: "Iced Latte", price: 6, description: "Cold brew with milk", category: "Beverages" },
  { id: 8, name: "Neon Theme Pack", price: 20, description: "LED strips and mood lights", category: "Room Themes" },
  { id: 9, name: "Retro Arcade Theme", price: 18, description: "Retro posters and 8-bit soundtrack", category: "Room Themes" },
];

function listMenu() {
  return menuItems;
}

module.exports = {
  listMenu,
};

const events = [
  {
    id: 1,
    title: "Gaming Tournament Weekends",
    description: "Compete in popular games, win prizes, and meet other players.",
    startDate: "2025-11-08",
    endDate: "2025-12-29",
    image:
      "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: 2,
    title: "Movie Marathon Fridays",
    description: "Book a room with a curated playlist of classics and snacks.",
    startDate: "2025-11-15",
    endDate: "2025-12-30",
    image:
      "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=80",
  },
];

function listEvents() {
  return events;
}

module.exports = {
  listEvents,
};

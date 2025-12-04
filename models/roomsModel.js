// Simple in-memory room "model" to keep things easy to follow.
const rooms = [
  {
    id: 1,
    name: "Collab Studio",
    capacity: 6,
    pricePerHour: 24,
    tags: ["TV", "Whiteboard", "Video Call"],
    description:
      "A cozy room with a large display, ideal for project check-ins or virtual calls.",
    image:
      "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: 2,
    name: "Sunset Lounge",
    capacity: 10,
    pricePerHour: 38,
    tags: ["Lounge", "Ambient", "Workshop"],
    description:
      "Soft seating, warm lighting, and plenty of space to brainstorm with a group.",
    image:
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: 3,
    name: "Focus Pod",
    capacity: 3,
    pricePerHour: 15,
    tags: ["Quiet", "Phone Booth", "Study"],
    description:
      "A small, quiet pod perfect for interviews, study sessions, or focus work.",
    image:
      "https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=1200&q=80",
  },
];

function getRooms() {
  return rooms;
}

function findRoomById(id) {
  return rooms.find((room) => room.id === id);
}

module.exports = {
  getRooms,
  findRoomById,
};

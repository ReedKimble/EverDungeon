# Game Architecture

## Development Environment

 * Windows
 * VisualStudio Code

## Overall Design

The game is a client/server architecture using the most compatible languages to meet all requirements. C# and/or TypeScript are preferred. Development will occur on Windows using Visual Studio.

The primary gameplay is single player, first person but there is a heavy MMO aspect to economy and player resource sharing. Visiting another player's world in co-op style play is post-MVP and should be planned as a future extension.

## Deployment

The game will be deployable to GitHub with an Azure backend. The web client will run from GitHub Pages and the game engine will rely on browser (client-side) primary execution with Azure Functions and Azure Storage (Tables, Queues, Blobs) for game state authority and control.

Players will register with their common OAuth identity (Microsoft, Google or Meta) and then log in to the game platform. Each player gets their own world but communication and item trade across worlds is possible. The "Pixie Economy" is made up of virtual "pixies" that do not generally exist in the game other than as interaction points for the player (any Pixie Character is basically a bank/auction house access point); they serve as a narrative mechanism for the cross-world banking, trading and auctioning system. Pixie trades should settle in minutes, not seconds, to encourage asynchronous play. The Pixies maintain a formal central market with auction house and direct trade. Direct trade can include negotiated goods and money, while market prices are set by Pixies based on material worth and then supply/demand.

## Infrastructure

- Most gameplay is client-side for performance.
- World saves are strict server-authoritative; immediately recent client changes may be lost during failures.
- Secure server-issued resource ID generation is required.
- Primary server security focus is inter-world transfer integrity and anti-duplication controls.
- Identity: Entra External ID with standard social login buttons (Microsoft, Google, Apple, Meta).
- Client/server communication: use proven, standard implementation (REST or well-established package).
- All inter-world transfers (direct trade or auction) must route through the server for unified cheat detection.
- Trade settlement timing: 5-minute baseline modified by NPC trader skill level (skilled traders faster, unskilled slower).



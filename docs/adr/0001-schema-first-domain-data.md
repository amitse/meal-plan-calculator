# Schema-first MasterData

The nutrition planning calculator will start from schema-defined **MasterData** rather than UI components or object-oriented classes. The schema is the source of truth for the data shape, while **MasterData** is the source of truth for the actual food, exchange, nutrition, and display-cost facts; calculation and planning logic will be built as a separate layer on top of that data.

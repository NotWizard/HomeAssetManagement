from enum import Enum


class HoldingType(str, Enum):
    ASSET = "asset"
    LIABILITY = "liability"


class SourceType(str, Enum):
    MANUAL = "manual"
    CSV = "csv"


class SnapshotTriggerType(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    IMPORT = "import"

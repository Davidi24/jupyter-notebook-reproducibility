"""Serializable result objects for notebook classification."""

from dataclasses import asdict, dataclass, field


@dataclass
class ClassifierResult:
    method: str
    primary_category: str
    secondary_categories: list[str]
    confidence: float
    reason: str
    evidence: list[str] = field(default_factory=list)
    scores: dict[str, float] = field(default_factory=dict)
    signal_statistics: dict[str, list[dict]] = field(default_factory=dict)
    model_name: str | None = None
    version: str | None = None
    raw_response: str | None = None

    def to_dict(self):
        return asdict(self)


@dataclass
class ClassificationResult:
    notebook_path: str
    notebook_sha256: str
    collector_version: str
    collection_stats: dict
    rule_result: ClassifierResult
    llm_result: ClassifierResult | None
    agreement_status: str
    needs_human_review: bool
    warning: str | None
    provisional_category: str | None
    final_category: str | None = None
    llm_error: str | None = None
    human_reviewer: str | None = None
    human_note: str | None = None
    human_reviewed_at: str | None = None

    @property
    def effective_category(self):
        return self.final_category or self.provisional_category

    def to_dict(self):
        result = asdict(self)
        result["effective_category"] = self.effective_category
        return result

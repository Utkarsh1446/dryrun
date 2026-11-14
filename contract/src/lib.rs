use near_sdk::store::LookupMap;
use near_sdk::{env, log, near, AccountId, PanicOnDefault};

/// One verifiable check. `timestamp_ns` is a decimal string so JSON keeps the full block time.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Receipt {
    pub id: u64,
    pub repo_url: String,
    pub commit_sha: String,
    pub result_hash: String,
    pub timestamp_ms: u64,
    pub timestamp_ns: String,
    pub checker_version: String,
    pub kind: String,
    pub quote_hash: Option<String>,
    pub recorder: AccountId,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    next_id: u64,
    receipts: LookupMap<u64, Receipt>,
    by_hash: LookupMap<String, u64>,
}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {
            owner: env::current_account_id(),
            next_id: 1,
            receipts: LookupMap::new(b"r".to_vec()),
            by_hash: LookupMap::new(b"h".to_vec()),
        }
    }

    /// Owner only. `kind` is `check` (no quote) or `deep` (quote hash required).
    pub fn record(
        &mut self,
        repo_url: String,
        commit_sha: String,
        result_hash: String,
        checker_version: String,
        kind: String,
        quote_hash: Option<String>,
    ) -> Receipt {
        self.assert_owner();
        require(valid_repo(&repo_url), "repo_url must be an https://github.com URL");
        require(is_hex(&commit_sha, 40), "commit_sha must be 40 hex characters");
        require(is_hex(&result_hash, 64), "result_hash must be 64 hex characters");
        require(valid_version(&checker_version), "checker_version is invalid");
        require(kind == "check" || kind == "deep", "kind must be check or deep");
        match (&kind[..], quote_hash.as_deref()) {
            ("check", None) => {}
            ("deep", Some(hash)) if is_hex(hash, 64) => {}
            ("deep", _) => env::panic_str("deep receipts need a 64-hex quote hash"),
            _ => env::panic_str("check receipts have no quote hash"),
        }

        let id = self.next_id;
        self.next_id = id + 1;
        let timestamp_ns = env::block_timestamp();
        let receipt = Receipt {
            id,
            repo_url,
            commit_sha,
            result_hash: result_hash.clone(),
            timestamp_ms: timestamp_ns / 1_000_000,
            timestamp_ns: timestamp_ns.to_string(),
            checker_version,
            kind: kind.clone(),
            quote_hash,
            recorder: env::predecessor_account_id(),
        };
        self.receipts.insert(id, receipt.clone());
        self.by_hash.insert(result_hash.clone(), id);
        log!("receipt id={id} kind={kind} hash={result_hash}");
        receipt
    }

    pub fn get_receipt(&self, id: u64) -> Option<Receipt> {
        self.receipts.get(&id).cloned()
    }

    pub fn get_by_hash(&self, result_hash: String) -> Option<Receipt> {
        let id = self.by_hash.get(&result_hash).copied()?;
        self.receipts.get(&id).cloned()
    }

    pub fn receipt_count(&self) -> u64 {
        self.next_id.saturating_sub(1)
    }

    pub fn owner(&self) -> AccountId {
        self.owner.clone()
    }
}

impl Contract {
    fn assert_owner(&self) {
        if env::predecessor_account_id() != self.owner {
            env::panic_str("Only the recorder account can record a receipt");
        }
    }
}

fn require(ok: bool, message: &str) {
    if !ok {
        env::panic_str(message);
    }
}

fn is_hex(value: &str, len: usize) -> bool {
    value.len() == len && value.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

fn valid_repo(value: &str) -> bool {
    value.len() <= 300
        && value.starts_with("https://github.com/")
        && !value.chars().any(|c| c.is_whitespace())
        && value.len() > "https://github.com/".len() + 2
}

fn valid_version(value: &str) -> bool {
    (1..=32).contains(&value.len())
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

#[cfg(all(test, feature = "unit-testing"))]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn context(predecessor: &str, when_ns: u64) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("dryrun.testnet".parse().unwrap())
            .signer_account_id(predecessor.parse().unwrap())
            .predecessor_account_id(predecessor.parse().unwrap())
            .block_timestamp(when_ns);
        testing_env!(builder.build());
    }

    fn sample(kind: &str, quote: Option<&str>) -> Receipt {
        Contract::new_in_test().record(
            "https://github.com/acme/widget".to_string(),
            "a".repeat(40),
            "b".repeat(64),
            "0.3.0".to_string(),
            kind.to_string(),
            quote.map(str::to_string),
        )
    }

    impl Contract {
        fn new_in_test() -> Self {
            context("dryrun.testnet", 1_700_000_000_000_000_000);
            Self::new()
        }
    }

    #[test]
    fn records_a_check_and_reads_it_back() {
        let mut contract = Contract::new_in_test();
        let saved = contract.record(
            "https://github.com/acme/widget".into(),
            "ab".repeat(20),
            "cd".repeat(32),
            "0.3.0".into(),
            "check".into(),
            None,
        );
        assert_eq!(saved.id, 1);
        assert_eq!(saved.timestamp_ms, 1_700_000_000_000);
        assert_eq!(saved.timestamp_ns, "1700000000000000000");
        assert_eq!(saved.recorder.as_str(), "dryrun.testnet");
        assert_eq!(contract.receipt_count(), 1);
        let by_id = contract.get_receipt(1).unwrap();
        assert_eq!(by_id.commit_sha, "ab".repeat(20));
        let by_hash = contract.get_by_hash("cd".repeat(32)).unwrap();
        assert_eq!(by_hash.id, 1);
        assert!(contract.get_receipt(2).is_none());
    }

    #[test]
    fn deep_receipt_stores_the_quote_hash_and_a_second_write_wins_the_index() {
        let mut contract = Contract::new_in_test();
        let quote = "e".repeat(64);
        let first = contract.record(
            "https://github.com/acme/widget".into(),
            "a".repeat(40),
            "b".repeat(64),
            "0.3.0".into(),
            "deep".into(),
            Some(quote.clone()),
        );
        let second = contract.record(
            "https://github.com/acme/widget".into(),
            "a".repeat(40),
            "b".repeat(64),
            "0.3.1".into(),
            "deep".into(),
            Some(quote),
        );
        assert_eq!(first.id, 1);
        assert_eq!(second.id, 2);
        assert_eq!(contract.get_by_hash("b".repeat(64)).unwrap().id, 2);
        assert_eq!(contract.get_receipt(1).unwrap().checker_version, "0.3.0");
        assert_eq!(contract.receipt_count(), 2);
    }

    #[test]
    #[should_panic(expected = "Only the recorder account")]
    fn rejects_a_caller_who_is_not_the_owner() {
        let mut contract = Contract::new_in_test();
        context("intruder.testnet", 1_700_000_000_000_000_000);
        contract.record(
            "https://github.com/acme/widget".into(),
            "a".repeat(40),
            "b".repeat(64),
            "0.3.0".into(),
            "check".into(),
            None,
        );
    }

    #[test]
    #[should_panic(expected = "deep receipts need")]
    fn deep_without_a_quote_hash_panics() {
        let mut contract = Contract::new_in_test();
        contract.record(
            "https://github.com/acme/widget".into(),
            "a".repeat(40),
            "b".repeat(64),
            "0.3.0".into(),
            "deep".into(),
            None,
        );
    }

    #[test]
    #[should_panic(expected = "check receipts have no quote hash")]
    fn check_with_a_quote_hash_panics() {
        let mut contract = Contract::new_in_test();
        contract.record(
            "https://github.com/acme/widget".into(),
            "a".repeat(40),
            "b".repeat(64),
            "0.3.0".into(),
            "check".into(),
            Some("e".repeat(64)),
        );
    }

    #[test]
    #[should_panic(expected = "commit_sha")]
    fn rejects_a_short_commit() {
        let mut contract = Contract::new_in_test();
        let _ = sample("check", None);
        contract.record(
            "https://github.com/acme/widget".into(),
            "abc".into(),
            "b".repeat(64),
            "0.3.0".into(),
            "check".into(),
            None,
        );
    }
}

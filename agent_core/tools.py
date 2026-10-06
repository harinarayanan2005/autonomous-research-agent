import requests
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS

def tool_search_web(query: str, max_results: int = 4) -> str:
    """
    Searches the live web using DuckDuckGo and returns titles, snippets, and URLs.
    """
    try:
        results = []
        with DDGS() as ddgs:
            raw_results = ddgs.text(query, max_results=max_results)
            for r in raw_results:
                results.append(
                    f"Title: {r.get('title')}\nURL: {r.get('href')}\nSnippet: {r.get('body')}\n"
                )
        if not results:
            return "No relevant search results found."
        return "\n---\n".join(results)
    except Exception as e:
        return f"Error executing web search: {str(e)}"


def tool_scrape_page(url: str, max_chars: int = 2500) -> str:
    """
    Fetches the content of a webpage and extracts clean, readable text.
    """
    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/119.0.0.0 Safari/537.36"
            )
        }
        response = requests.get(url, headers=headers, timeout=8)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        # Strip scripts, styles, and unwanted tags
        for element in soup(["script", "style", "noscript", "header", "footer", "nav"]):
            element.decompose()

        text = soup.get_text(separator=" ", strip=True)
        # Clean extra whitespace
        cleaned_text = " ".join(text.split())

        if not cleaned_text:
            return "Webpage content was empty or could not be parsed."

        # Return the most relevant initial chunk
        return cleaned_text[:max_chars]
    except Exception as e:
        return f"Error scraping page {url}: {str(e)}"


# Dictionary mapping tool names to actual functions for easy lookup
AVAILABLE_TOOLS = {
    "search_web": tool_search_web,
    "scrape_page": tool_scrape_page,
}
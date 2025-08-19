import json
import os
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from datetime import datetime

class SimilarityAnalyzer:
    def __init__(self):
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
    
    def count_words(self, text):
        """Count words in text, handling edge cases"""
        if not text or not isinstance(text, str):
            return 0
        
        # Split by whitespace and filter out empty strings
        words = [word.strip() for word in text.split() if word.strip()]
        return len(words)
    
    def find_similar_sections_fast(self, selected_text, processed_files, processed_folder, top_n=10):
        """Find similar sections using precomputed embeddings for fast response"""
        try:
            # Load all sections with precomputed embeddings
            sections = self.load_sections_with_embeddings(processed_files, processed_folder)
            
            if not sections:
                return []
            
            # Encode the query text
            query_embedding = self.model.encode([selected_text])
            
            # Calculate similarities using precomputed embeddings
            similarities = []
            for section in sections:
                section_embedding = np.array(section['embedding']).reshape(1, -1)
                similarity = cosine_similarity(query_embedding, section_embedding)[0][0]
                similarities.append(similarity)
            
            # Add similarity scores to sections
            for i, section in enumerate(sections):
                section['similarity_score'] = float(similarities[i])
            
            # Sort by similarity score
            ranked_sections = sorted(sections, key=lambda x: x['similarity_score'], reverse=True)
            
            # Filter sections with at least 15 words and return top N results
            results = []
            rank_counter = 1
            filtered_count = 0
            
            for section in ranked_sections:
                # Count words in the content
                word_count = self.count_words(section['content'])
                
                # Skip sections with less than 15 words
                if word_count < 15:
                    filtered_count += 1
                    continue
                
                # Add section to results
                results.append({
                    "document": section['document'],
                    "section_title": section['section_title'],
                    "importance_rank": rank_counter,
                    "page_number": section['page_number'],
                    "similarity_score": section['similarity_score'],
                    "level": section['level'],
                    "content": section['content'],
                    "word_count": word_count
                })
                
                rank_counter += 1
                
                # Stop when we have enough results
                if len(results) >= top_n:
                    break
            
            print(f"🔍 Similarity search: {len(ranked_sections)} total sections, {filtered_count} filtered out (<15 words), {len(results)} returned")
            
            return results
            
        except Exception as e:
            raise Exception(f"Error in fast similarity analysis: {str(e)}")
    
    def load_sections_with_embeddings(self, processed_files, processed_folder):
        """Load sections with precomputed embeddings from processed JSON files"""
        sections = []
        
        for file_info in processed_files:
            json_path = file_info['json_path']
            pdf_filename = file_info['original_file']
            
            if not os.path.exists(json_path):
                continue
                
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Check if sections with embeddings exist
            if 'sections' not in data:
                print(f"Warning: No precomputed sections found in {pdf_filename}")
                continue
            
            # Add document name to each section
            for section in data['sections']:
                section['document'] = pdf_filename
                sections.append(section)
        
        return sections
    
    def find_similar_sections(self, selected_text, processed_files, processed_folder, top_n=10):
        """Main method - uses fast similarity analysis with precomputed embeddings"""
        return self.find_similar_sections_fast(selected_text, processed_files, processed_folder, top_n)
    
    def get_section_content(self, document_name, section_title, processed_files, processed_folder):
        """Get full content of a specific section from precomputed data"""
        for file_info in processed_files:
            if file_info['original_file'] == document_name:
                json_path = file_info['json_path']
                
                with open(json_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                # Find the section in precomputed sections
                if 'sections' in data:
                    for section in data['sections']:
                        if section['section_title'] == section_title:
                            return section['content']
                
                # Fallback to outline if sections not found
                for heading in data.get('outline', []):
                    if heading['text'] == section_title:
                        # This would require PDF access, but we prefer precomputed content
                        return f"Content for {section_title} (not precomputed)"
                
                break
        
        return None
    
    def get_document_summary(self, document_name, processed_files, processed_folder):
        """Get document summary from precomputed data"""
        for file_info in processed_files:
            if file_info['original_file'] == document_name:
                json_path = file_info['json_path']
                
                with open(json_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                return {
                    'title': data.get('title', ''),
                    'total_sections': len(data.get('sections', [])),
                    'outline': data.get('outline', []),
                    'metadata': data.get('metadata', {})
                }
        
        return None
    
    def search_across_all_documents(self, query_text, processed_files, processed_folder, top_n=10):
        """Search across all documents using precomputed embeddings"""
        try:
            # Load all sections with embeddings
            sections = self.load_sections_with_embeddings(processed_files, processed_folder)
            
            if not sections:
                return []
            
            # Encode the query
            query_embedding = self.model.encode([query_text])
            
            # Calculate similarities
            similarities = []
            for section in sections:
                section_embedding = np.array(section['embedding']).reshape(1, -1)
                similarity = cosine_similarity(query_embedding, section_embedding)[0][0]
                similarities.append(similarity)
            
            # Add similarity scores and sort
            for i, section in enumerate(sections):
                section['similarity_score'] = float(similarities[i])
            
            ranked_sections = sorted(sections, key=lambda x: x['similarity_score'], reverse=True)
            
            # Filter sections with at least 15 words and return top results
            results = []
            rank_counter = 1
            filtered_count = 0
            
            for section in ranked_sections:
                # Count words in the content
                word_count = self.count_words(section['content'])
                
                # Skip sections with less than 15 words
                if word_count < 15:
                    filtered_count += 1
                    continue
                
                # Add section to results
                results.append({
                    "document": section['document'],
                    "section_title": section['section_title'],
                    "rank": rank_counter,
                    "page_number": section['page_number'],
                    "similarity_score": section['similarity_score'],
                    "level": section['level'],
                    "content_preview": section['content'][:200] + "..." if len(section['content']) > 200 else section['content'],
                    "word_count": word_count
                })
                
                rank_counter += 1
                
                # Stop when we have enough results
                if len(results) >= top_n:
                    break
            
            print(f"🔍 Cross-document search: {len(ranked_sections)} total sections, {filtered_count} filtered out (<15 words), {len(results)} returned")
            
            return results
            
        except Exception as e:
            raise Exception(f"Error in cross-document search: {str(e)}")

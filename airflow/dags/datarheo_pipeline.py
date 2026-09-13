from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta
import requests
import subprocess
import json
import sys
import os

default_args = {
    'owner': 'datarheo',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

def run_pipeline_task(**context):
    """
    Execute a data pipeline using pydatarheo
    """
    task_instance = context['task_instance']
    pipeline_config = task_instance.xcom_pull(task_ids='get_pipeline_config')
    
    if not pipeline_config:
        raise ValueError("Pipeline configuration not found")
    
    try:
        import datarheo as dr
        
        # Get source connector
        source = dr.get_source(
            pipeline_config['source_connector'],
            config=pipeline_config['source_config'],
            install_if_missing=True
        )
        source.check()
        source.select_all_streams()
        
        # Get destination connector
        dest = dr.get_destination(
            pipeline_config['destination_connector'],
            config=pipeline_config['destination_config'],
            install_if_missing=True
        )
        dest.check()
        
        # Run the pipeline
        result = source.read(cache=dest)
        
        # Update job status via API
        job_id = context['dag_run'].conf.get('job_id')
        if job_id:
            update_job_status(job_id, 'SUCCESS', {
                'records_read': sum(len(stream.records) for stream in result.values()),
                'records_written': sum(len(stream.records) for stream in result.values())
            })
        
        return {
            'status': 'success',
            'streams_processed': list(result.keys())
        }
        
    except Exception as e:
        job_id = context['dag_run'].conf.get('job_id')
        if job_id:
            update_job_status(job_id, 'FAILED', {
                'error_message': str(e)
            })
        raise

def get_pipeline_config(**context):
    """
    Fetch pipeline configuration from the API
    """
    task_instance = context['task_instance']
    pipeline_id = context['dag_run'].conf.get('pipeline_id')
    
    if not pipeline_id:
        raise ValueError("Pipeline ID not provided")
    
    # Fetch from backend API
    api_url = os.getenv('DATARHEO_API_URL', 'http://backend:8000')
    response = requests.get(f"{api_url}/api/pipelines/{pipeline_id}")
    
    if response.status_code != 200:
        raise ValueError(f"Failed to fetch pipeline: {response.text}")
    
    pipeline_data = response.json()['data']['pipeline']
    
    return {
        'pipeline_id': pipeline_id,
        'source_connector': pipeline_data['sourceConfig']['connectorName'],
        'source_config': pipeline_data['sourceConfig']['config'],
        'destination_connector': pipeline_data['destinationConfig']['connectorName'],
        'destination_config': pipeline_data['destinationConfig']['config'],
        'streams': pipeline_data.get('streams', {})
    }

def update_job_status(job_id: str, status: str, metadata: dict = None):
    """
    Update job status in the backend API
    """
    api_url = os.getenv('DATARHEO_API_URL', 'http://backend:8000')
    
    update_data = {
        'status': status,
        'completed_at': datetime.utcnow().isoformat() if status in ['SUCCESS', 'FAILED'] else None
    }
    
    if metadata:
        update_data.update(metadata)
    
    response = requests.patch(f"{api_url}/api/jobs/{job_id}", json=update_data)
    
    if response.status_code != 200:
        print(f"Failed to update job status: {response.text}")

def create_dag(pipeline_id: str, schedule_interval: str = None):
    """
    Dynamically create a DAG for a specific pipeline
    """
    dag_id = f'datarheo_pipeline_{pipeline_id}'
    
    with DAG(
        dag_id=dag_id,
        default_args=default_args,
        schedule_interval=schedule_interval,
        catchup=False,
        max_active_runs=1,
        tags=['datarheo', 'data-integration']
    ) as dag:
        
        get_config = PythonOperator(
            task_id='get_pipeline_config',
            python_callable=get_pipeline_config
        )
        
        run_pipeline = PythonOperator(
            task_id='run_pipeline',
            python_callable=run_pipeline_task
        )
        
        get_config >> run_pipeline
    
    return dag

# Example DAG for testing
example_dag = create_dag('example', '@daily')

import "dotenv/config"
/*
* contain env variables
*/

const envConfig = {
	DATABASE_URL: process.env.DATABASE_CONNECTION_URL,
	UPSTASH_REDIS_URL: process.env.UPSTASH_REDIS_REST_URL,
	UPSTASH_REDIS_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
	BREVO_API_KEY: process.env.BREVO_API_KEY,
}

export default envConfig